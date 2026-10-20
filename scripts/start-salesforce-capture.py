#!/usr/bin/env python3
"""Start a reproducible native capture using the current Mac install and an owned Herdr pane."""
# CLI filenames follow repository conventions; orchestration keeps one lifecycle owner.
# pylint: disable=invalid-name,too-many-locals,too-many-statements

import argparse
import hashlib
import json
import os
import platform
import shlex
import shutil
import subprocess
import time
from pathlib import Path
from typing import Any

STARTUP_TIMEOUT = 60
DEFAULT_DELAY_MS = 40
MAX_DELAY_MS = 30000
ROOT = Path(__file__).resolve().parents[1]


def cases(mode: str, coverage: str = "baseline") -> list[dict[str, Any]]:
    """Build safe fixture cases or supported-MacBook read-only service cases."""
    basic: list[dict[str, Any]] = [
        {
            "id": "query-zero",
            "tool": "sf_query",
            "args": {
                "query": "SELECT COUNT(Id) total FROM Opportunity WHERE Id = null"
            },
        },
        {"id": "describe", "tool": "sf_describe", "args": {"sobject": "Opportunity"}},
        {"id": "org", "tool": "sf_org_display", "args": {}},
        {"id": "help", "tool": "sf_help", "args": {"command_path": "data query"}},
        {
            "id": "exec",
            "tool": "sf_exec",
            "args": {
                "args": [
                    "data",
                    "query",
                    "--query",
                    "SELECT COUNT(Id) total FROM Opportunity WHERE Id = null",
                    "--json",
                ]
            },
        },
        {"id": "pipeline", "tool": "sf_pipeline_report", "args": {}},
    ]
    if coverage == "remaining":
        if mode != "fixture":
            msg = "Fault coverage is fixture-only"
            raise ValueError(msg)
        expected = {
            "sf_query": {
                "empty": ["0 records returned"],
                "partial": ["Partial results"],
            },
            "sf_exec": {"empty": ["(no output)"], "partial": ["Partial results"]},
            "sf_describe": {"empty": ["0"], "partial": ["Synthetic partial catalog"]},
            "sf_org_display": {
                "empty": ["authenticated identity is not verified"],
                "partial": ["Synthetic partial identity"],
            },
            "sf_help": {
                "empty": ["No help output"],
                "partial": ["Synthetic partial help"],
            },
            "sf_pipeline_report": {
                "empty": ["no entries in this report"],
                "partial": ["incomplete results", "narrower scope", "complete export"],
            },
        }
        return [
            {
                **case,
                "id": case["tool"] + "-" + outcome,
                "fixtureOutcome": outcome,
                "expectedError": outcome in {"unavailable", "failed"}
                or (case["tool"] == "sf_org_display" and outcome == "empty")
                or (case["tool"] == "sf_pipeline_report" and outcome == "partial"),
                "expectedText": expected[case["tool"]].get(
                    outcome,
                    [
                        "Synthetic service unavailable"
                        if outcome == "unavailable"
                        else "Synthetic command failed",
                        "Select an authenticated target_org"
                        if outcome == "unavailable"
                        else "Run sf help",
                    ],
                ),
            }
            for case in basic
            for outcome in ["empty", "unavailable", "partial", "failed"]
        ]
    if mode == "live":
        return basic
    return [
        *basic,
        {
            "id": "query-empty",
            "tool": "sf_query",
            "args": {"query": "SELECT Id FROM Opportunity WHERE Id = null"},
        },
        {
            "id": "query-money",
            "tool": "sf_query",
            "args": {
                "query": "SELECT Name, Amount, CurrencyIsoCode, IsClosed, NextStep FROM Opportunity"
            },
        },
        {
            "id": "query-partial",
            "tool": "sf_query",
            "args": {"query": "SELECT Id FROM Opportunity /* partial */"},
        },
        {
            "id": "query-failure",
            "tool": "sf_query",
            "args": {"query": "SELECT DefinitelyMissingDemoField__c FROM Opportunity"},
            "expectedError": True,
        },
        {
            "id": "query-fidelity",
            "tool": "sf_query",
            "args": {
                "query": "SELECT Count__c, Enabled__c, Empty__c, Literal__c FROM SyntheticPresentation__c"
            },
        },
        {
            "id": "query-copy",
            "tool": "sf_query",
            "args": {
                "query": "SELECT Id FROM Opportunity WHERE Name = '$HOME $(printf safe) ; | 北方'"
            },
        },
        {
            "id": "org-unavailable",
            "tool": "sf_org_display",
            "args": {"target_org": "xcsh-style-intentionally-missing-org"},
            "expectedError": True,
        },
    ]


def select_cases(
    available: list[dict[str, Any]], requested: list[str]
) -> list[dict[str, Any]]:
    """Select explicit known cases without silently dropping typos or duplicates."""
    if not requested:
        return available
    if len(set(requested)) != len(requested):
        msg = "Duplicate capture case IDs"
        raise ValueError(msg)
    known = {case["id"]: case for case in available}
    if set(requested) - known.keys():
        msg = "Unknown capture case IDs"
        raise ValueError(msg)
    return [known[identifier] for identifier in requested]


def retire_owned_capture(root: Path) -> dict[str, Any]:
    """Retire only a shutdown-qualified pane on its recorded Herdr server."""
    manifest = json.loads((root / "manifest.json").read_text())
    if manifest.get("completed") is not True or not any(
        row.get("event") == "session_shutdown" for row in manifest.get("lifecycle", [])
    ):
        msg = "Capture completion and shutdown evidence are required before retirement"
        raise ValueError(msg)
    owned = json.loads((root / "owned-pane.json").read_text())
    server = json.loads(
        subprocess.check_output(
            ["herdr", "status", "server", "--json"],  # noqa: S607 - inherited Herdr CLI
            text=True,
        )
    )
    binding = hashlib.sha256(
        (str(server.get("socket")) + str(server.get("protocol"))).encode()
    ).hexdigest()
    if owned["serverBinding"] != binding or owned["pane"] == owned["originalPane"]:
        msg = "Capture pane ownership or Herdr server binding does not match"
        raise ValueError(msg)
    inventory = json.loads(
        subprocess.check_output(  # noqa: S603 - verified owned workspace
            ["herdr", "pane", "list", "--workspace", owned["workspace"]],  # noqa: S607 - inherited Herdr CLI
            text=True,
        )
    )
    absent = all(
        pane["pane_id"] != owned["pane"] for pane in inventory["result"]["panes"]
    )
    if not absent:
        subprocess.run(["herdr", "pane", "close", owned["pane"]], check=True)  # noqa: S603,S607 - verified owned pane on inherited Herdr server
    return {"pane": owned["pane"], "alreadyRetired": absent}


def main() -> None:
    """Run the explicitly scoped capture workflow."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--mode", choices=["fixture", "live"], default="fixture")
    parser.add_argument("--delay-ms", type=int, default=40)
    parser.add_argument(
        "--case",
        action="append",
        default=[],
        help="Capture only this known case ID; repeat for multiple cases",
    )
    parser.add_argument(
        "--coverage", choices=["baseline", "remaining"], default="baseline"
    )
    parser.add_argument(
        "--pane",
        help="Reuse a pane previously recorded as owned in this capture directory",
    )
    args = parser.parse_args()
    if platform.system() != "Darwin" or os.environ.get("HERDR_ENV") != "1":
        msg = "This campaign requires the authorized MacBook's managed Herdr binding"
        raise RuntimeError(msg)
    if args.mode == "live" and args.delay_ms != DEFAULT_DELAY_MS:
        msg = "Synthetic delay controls are fixture-only"
        raise ValueError(msg)
    if not 0 <= args.delay_ms <= MAX_DELAY_MS:
        msg = "Synthetic delay must be between 0 and 30000 ms"
        raise ValueError(msg)
    selected_cases = select_cases(cases(args.mode, args.coverage), args.case)
    root = args.root.resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    root.chmod(0o700)
    if (root / "ready.json").exists():
        msg = "Capture root already has a run; preserve it and choose a fresh root"
        raise RuntimeError(msg)
    registry = json.loads(
        (Path.home() / ".xcsh/plugins/installed_plugins.json").read_text()
    )
    plugins = [
        row
        for key, rows in registry["plugins"].items()
        if key.split("@")[0] == "salesforce"
        for row in rows
    ]
    if len(plugins) != 1:
        msg = "Installed Salesforce target is ambiguous"
        raise RuntimeError(msg)
    plugin = Path(plugins[0]["installPath"]).resolve()
    binary_name = shutil.which("xcsh")
    if binary_name is None:
        msg_0 = "Installed xcsh executable is unavailable"
        raise FileNotFoundError(msg_0)
    binary = Path(binary_name).resolve()
    version = subprocess.check_output([str(binary), "--version"], text=True).strip()  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
    server = json.loads(
        subprocess.check_output(["herdr", "status", "server", "--json"], text=True)  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
    )
    if not server.get("capabilities", {}).get("surface_interest"):
        msg = "Herdr capture surface is unsupported"
        raise RuntimeError(msg)
    current = json.loads(
        subprocess.check_output(["herdr", "pane", "current", "--current"], text=True)  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
    )["result"]["pane"]
    binding = hashlib.sha256(
        (str(server.get("socket")) + str(server.get("protocol"))).encode()
    ).hexdigest()
    if args.pane:
        recorded = json.loads((root / "owned-pane.json").read_text())
        if recorded["pane"] != args.pane or recorded["serverBinding"] != binding:
            msg = "Pane ownership or server binding does not match"
            raise RuntimeError(msg)
        pane = args.pane
    else:
        created = json.loads(
            subprocess.check_output(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
                [  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
                    "herdr",
                    "pane",
                    "split",
                    "--current",
                    "--direction",
                    "right",
                    "--cwd",
                    str(ROOT),
                    "--no-focus",
                ],
                text=True,
            )
        )
        pane = created["result"]["pane"]["pane_id"]
        (root / "owned-pane.json").write_text(
            json.dumps(
                {
                    "pane": pane,
                    "serverBinding": binding,
                    "originalPane": current["pane_id"],
                    "workspace": current["workspace_id"],
                }
            )
        )
    (root / "pane-id").write_text(pane)
    subprocess.run(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
        ["herdr", "pane", "rename", pane, "Salesforce native capture"],  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
        stdout=subprocess.DEVNULL,
        check=True,
    )
    subprocess.run(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
        ["herdr", "pane", "zoom", pane, "--on"],  # noqa: S607 - verified inherited Herdr CLI
        stdout=subprocess.DEVNULL,
        check=True,
    )
    (root / "agent").mkdir(mode=0o700, exist_ok=True)
    (root / "cases.json").write_text(json.dumps(selected_cases))
    env = [
        "PI_CODING_AGENT_DIR=" + str(root / "agent"),
        "PRESENTATION_CAPTURE_ROOT=" + str(root),
        "PRESENTATION_CAPTURE_PLUGIN=" + str(plugin),
        "PRESENTATION_CAPTURE_MODE=" + args.mode,
    ]
    if args.mode == "fixture":
        fixture = root / "fixture"
        fixture.mkdir(mode=0o700, exist_ok=True)
        source = ROOT / "plugins/salesforce/benchmarks"
        (fixture / "presentation-fixtures.ts").write_bytes(
            (source / "presentation-fixtures.ts").read_bytes()
        )
        code = (
            "await Bun.sleep(Number(process.env.PRESENTATION_FIXTURE_DELAY_MS ?? 40));\n"
            + (source / "fixture-sf.ts").read_text()
        )
        code = code.replace(
            "else if (query.includes('COUNT('))",
            "else if (query.includes('SyntheticPresentation__c')) result = {records:[{Count__c:0,Enabled__c:false,Empty__c:'',Literal__c:\"$HOME $(printf safe) ; | 北方\"}],totalSize:1,done:true};\nelse if (query.includes('COUNT('))",
        )
        code = code.replace(
            "const args = process.argv.slice(2);",
            (
                "const args = process.argv.slice(2);\n"
                + (ROOT / "scripts/salesforce-fixture-outcomes.ts").read_text()
            ),
        )
        (fixture / "fixture-sf.ts").write_text(code)
        (root / "bin").mkdir(mode=0o700, exist_ok=True)
        wrapper = root / "bin/sf"
        wrapper.write_text(
            "#!/bin/sh\nexec "
            + shlex.quote(shutil.which("bun") or "bun")
            + " "
            + shlex.quote(str(fixture / "fixture-sf.ts"))
            + ' "$@"\n'
        )
        wrapper.chmod(0o700)
        env.append("PRESENTATION_FIXTURE_DELAY_MS=" + str(args.delay_ms))
        env.append("PRESENTATION_FIXTURE_CONTROL=" + str(root / "fixture-control.json"))
        env.append("PATH=" + str(root / "bin") + ":" + os.environ["PATH"])
    command = [
        "env",
        *env,
        str(binary),
        "--no-session",
        "--no-memories",
        "--no-skills",
        "--no-rules",
        "--no-extensions",
        "--no-title",
        "--no-lsp",
        "--extension",
        str(ROOT / "scripts/capture-salesforce-native.ts"),
    ]
    launch = root / "launch.sh"
    launch.write_text("#!/bin/sh\numask 077\nexec " + shlex.join(command) + "\n")
    launch.chmod(0o700)
    subprocess.run(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
        ["herdr", "pane", "run", pane, "exec " + shlex.quote(str(launch))],  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
        stdout=subprocess.DEVNULL,
        check=True,
    )
    start = time.monotonic()
    while time.monotonic() - start < STARTUP_TIMEOUT:
        if (root / "ready.json").exists():
            ready = json.loads((root / "ready.json").read_text())
            if (
                Path(ready["binary"]).resolve() != binary
                or ready["pluginVersion"] != plugins[0]["version"]
            ):
                msg = "Native capture provenance does not match selected installation"
                raise RuntimeError(msg)
            (root / "provenance.json").write_text(
                json.dumps(
                    {
                        "nativeVersion": version,
                        "binary": str(binary),
                        "pluginVersion": plugins[0]["version"],
                        "serverBinding": binding,
                        "mode": args.mode,
                        "controllerSha256": hashlib.sha256(
                            (ROOT / "scripts/capture-salesforce-native.ts").read_bytes()
                        ).hexdigest(),
                    },
                    indent=2,
                )
            )
            print(json.dumps({"root": str(root), "pane": pane, "ready": ready}))
            return
        time.sleep(0.1)
    msg = "Native capture startup did not acknowledge readiness; inspect only this owned pane"
    raise TimeoutError(msg)


if __name__ == "__main__":
    main()
