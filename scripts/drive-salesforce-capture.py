#!/usr/bin/env python3
"""Drive one task-owned native Herdr capture session and inspect frames serially."""
# CLI filenames follow repository conventions; orchestration keeps one lifecycle owner.
# pylint: disable=invalid-name,too-many-locals,too-many-statements

import argparse
import hashlib
import json
import os
import re
import subprocess
import time
import unicodedata
from pathlib import Path
from typing import Any

ANSI = re.compile(r"\x1b\[[0-?]*[ -/]*[@-~]")


def plain(value: str) -> str:
    """Remove styling escapes without modifying literal text."""
    return ANSI.sub("", value)


def columns(value: str) -> int:
    """Measure visible terminal cells, including combining and wide characters."""
    return sum(
        0
        if unicodedata.combining(c)
        else 2
        if unicodedata.east_asian_width(c) in "WF"
        else 1
        for c in plain(value)
    )


def atomic(path: Path, value: object) -> None:
    """Publish a private capture control value atomically."""
    temporary = path.with_suffix(".tmp")
    temporary.write_text(json.dumps(value))
    temporary.chmod(0o600)
    temporary.replace(path)


def expected_argv(case: dict[str, Any]) -> list[str] | None:
    """Resolve the documented CLI invocation for a controlled case."""
    args = case["args"]
    tool = case["tool"]
    if tool == "sf_query":
        result = ["data", "query", "--query", args["query"]]
    elif tool == "sf_describe":
        result = ["sobject", "describe", "--sobject", args["sobject"].strip()]
    elif tool == "sf_org_display":
        result = ["org", "display"]
    elif tool == "sf_help":
        return [*filter(None, re.split(r"[ :]+", args.get("command_path", "").strip())), "--help"]
    elif tool == "sf_exec":
        return args["args"]
    else:
        return None
    if args.get("target_org"):
        result += ["--target-org", args["target_org"]]
    return [*result, "--json"]


def verify_commands(
    root: Path,
    frame: dict[str, Any],
    case: dict[str, Any],
    required_shells: tuple[str, ...] = ("/bin/bash", "/bin/zsh"),
) -> dict[str, Any]:
    """Execute only captured fixture commands against an argv recorder."""
    expected = expected_argv(case)
    if expected is None:
        return {"capability": "no single CLI command exposed"}
    declared = frame.get("commands", [])
    if not declared or not isinstance(declared[0], dict):
        return {"passed": False, "reason": "No declared command argv captured"}
    argv = declared[0].get("argv")
    if not isinstance(argv, list) or argv != ["sf", *expected]:
        return {"passed": False, "reason": "Declared argv differs from the scoped invocation"}
    expected = argv[1:]
    command_lines: list[str] = []
    for row in frame["lines"]:
        value = plain(row)
        if value[:2] in ["│ ", "| "] and value[-1:] in ["│", "|"]:
            value = value[2:-1].rstrip()
            if (not command_lines and value.startswith("sf ")) or (
                command_lines and command_lines[-1].endswith("\\")
            ):
                command_lines.append(value)
            elif command_lines:
                break
    commands = ["\n".join(command_lines)] if command_lines else []
    if not commands:
        return {"passed": False, "reason": "No copyable command captured"}
    recorder = root / "argv-recorder"
    recorder.mkdir(mode=0o700, exist_ok=True)
    executable = recorder / "sf"
    executable.write_text(
        "#!/usr/bin/env python3\nimport json,os,sys\nopen(os.environ['PRESENTATION_CAPTURE_ARGV_PATH'],'w').write(json.dumps(sys.argv[1:]))\n"
    )
    executable.chmod(0o700)
    outcomes = {}
    for shell in required_shells:
        if not Path(shell).is_file():
            outcomes[Path(shell).name] = False
            continue
        target = recorder / (Path(shell).name + ".json")
        target.unlink(missing_ok=True)
        env = {
            **os.environ,
            "PATH": str(recorder) + ":" + os.environ["PATH"],
            "PRESENTATION_CAPTURE_ARGV_PATH": str(target),
        }
        child = subprocess.run(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
            [shell, "-c", commands[0]],
            env=env,
            check=False,
            capture_output=True,
            timeout=10,
        )
        actual = json.loads(target.read_text()) if target.exists() else None
        outcomes[Path(shell).name] = child.returncode == 0 and actual == expected
    return {"passed": all(outcomes.values()), "shells": outcomes}


def inspect_frame(
    root: Path, frame: dict[str, Any], case: dict[str, Any]
) -> dict[str, Any]:
    """Check one complete native frame and retain its explicit findings."""
    text = plain("\n".join(frame["lines"]))
    failures = []
    if any(columns(line) > frame["width"] for line in frame["lines"]):
        failures.append("overflow")
    if not frame["lines"]:
        failures.append("empty-frame")
    if frame["resultIsError"] != bool(case.get("expectedError", False)):
        failures.append("unexpected-tool-outcome")
    if "SYNTHETIC_SECRET_SENTINEL" in text:
        failures.append("unsafe-evidence")
    if case["id"] == "query-zero" and not re.search(
        r"Opportunity count\s*[│|]?\s*0", text
    ):
        failures.append("zero-not-visible")
    if case["id"] == "query-fidelity":
        for value in ["false", '""', "$HOME", "printf", "北方"]:
            if value not in text:
                failures.append("lost-literal:" + value)  # noqa: PERF401 - continuation parsing is ordered and stateful
    if case["id"] == "query-money" and "123,457.78" not in text:
        failures.append("monetary-grouping")
    if case["id"] == "query-failure" and "DefinitelyMissingDemoField__c" not in text:
        failures.append("lost-error-evidence")
    commands = verify_commands(root, frame, case)
    if commands.get("passed") is False:
        failures.append("command-copy")
    return {
        "id": frame["id"],
        "case": case["id"],
        "width": frame["width"],
        "theme": frame["theme"],
        "preset": frame["preset"],
        "expanded": frame["expanded"],
        "passed": not failures,
        "failures": failures,
        "commands": commands,
    }


def wait(root: Path, target: str, timeout: int = 180) -> dict[str, Any]:
    """Wait for the matching capture acknowledgement, not process-idle heuristics."""
    start = time.monotonic()
    while time.monotonic() - start < timeout:
        error = root / "error.json"
        if error.exists():
            raise RuntimeError(
                "Capture controller failed; private diagnostic: " + str(error)
            )
        try:
            ack = json.loads((root / "ack.json").read_text())
            if ack.get("id") == target:
                return ack
        except (FileNotFoundError, json.JSONDecodeError):
            pass
        time.sleep(0.04)
    raise TimeoutError("Native capture acknowledgement missing: " + target)


def main() -> None:
    """Run the explicitly scoped capture workflow."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--pane", required=True)
    parser.add_argument("--limit", type=int)
    parser.add_argument("--inspect-only", action="store_true")
    args = parser.parse_args()
    root = args.root.resolve()
    cases = json.loads((root / "cases.json").read_text())
    widths = [40, 76, 120, 153]
    ready = json.loads((root / "ready.json").read_text())
    if ready["terminalColumns"] not in widths:
        widths.append(ready["terminalColumns"])
    snapshots = root / "visible"
    snapshots.mkdir(mode=0o700, exist_ok=True)
    journal = root / "inspection.jsonl"
    failures = []
    captured = 0
    with journal.open("a") as findings:
        for preset in ["unicode", "ascii", "nerd"]:
            for theme in ["xcsh-dark", "xcsh-light"]:
                for case in cases:
                    for expanded in [False, True]:
                        for width in widths:
                            identifier = f"{case['id']}-{theme}-{preset}-{width}-{'E' if expanded else 'C'}"
                            frame_path = root / "frames" / (identifier + ".json")
                            if frame_path.exists():
                                frame = json.loads(frame_path.read_text())
                            else:
                                atomic(
                                    root / "control.json",
                                    {
                                        "id": identifier,
                                        "case": case["id"],
                                        "theme": theme,
                                        "preset": preset,
                                        "width": width,
                                        "expanded": expanded,
                                    },
                                )
                                wait(root, identifier)
                                frame = json.loads(frame_path.read_text())
                            finding = inspect_frame(root, frame, case)
                            finding["frameSha256"] = hashlib.sha256(
                                frame_path.read_bytes()
                            ).hexdigest()
                            findings.write(json.dumps(finding) + "\n")
                            findings.flush()
                            if not finding["passed"]:
                                failures.append(finding)
                            # The native renderer buffer is complete. Preserve an independent Herdr
                            # viewport observation as a separate evidence tier, without desktop control.
                            if (
                                width == ready["terminalColumns"]
                                and not args.inspect_only
                            ):
                                time.sleep(0.08)
                                value = subprocess.check_output(  # noqa: S603 - argv is fixed or comes from the owner-controlled capture protocol
                                    [  # noqa: S607 - argv is fixed or comes from the owner-controlled capture protocol
                                        "herdr",
                                        "pane",
                                        "read",
                                        args.pane,
                                        "--source",
                                        "visible",
                                        "--lines",
                                        "60",
                                        "--format",
                                        "ansi",
                                    ]
                                )
                                (snapshots / (identifier + ".ansi")).write_bytes(value)
                            captured += 1
                            if captured % 40 == 0:
                                print(
                                    f"CAPTURE_PROGRESS frames={captured} failed={len(failures)}",
                                    flush=True,
                                )
                            if args.limit and captured >= args.limit:
                                print(
                                    f"CAPTURE_LIMIT frames={captured} failed={len(failures)}",
                                    flush=True,
                                )
                                return
    summary = {
        "frames": captured,
        "caseCount": len(cases),
        "widths": widths,
        "failureCount": len(failures),
        "failures": failures,
        "runtimeVersion": ready["runtimeVersion"],
        "pluginVersion": ready["pluginVersion"],
        "host": "Mac",
        "evidenceTier": "native-renderer-and-herdr-viewport",
    }
    atomic(root / "inspection-summary.json", summary)
    print(f"CAPTURE_COMPLETE frames={captured} failed={len(failures)}", flush=True)


if __name__ == "__main__":
    main()
