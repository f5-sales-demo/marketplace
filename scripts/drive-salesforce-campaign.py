#!/usr/bin/env python3
"""Drive explicit read-only guidance acceptance through an owned published TUI."""

# Standalone filenames follow the repository CLI convention.
# pylint: disable=invalid-name
import argparse
import json
import os
import platform
import re
import shlex
import subprocess
import time
from contextlib import suppress
from pathlib import Path


def rows(path: Path) -> list[dict]:
    """Read complete observer records; never treat an incomplete tail as success."""
    if not path.exists():
        return []
    return [json.loads(line) for line in path.read_text().splitlines() if line]


def wait_ready(root: Path, plugin_version: str, timeout: float = 60) -> None:
    """Require runtime UI readiness and matching installed provenance before input."""
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        ready = [row for row in rows(root / "events.jsonl") if row["event"] == "ready"]
        if ready:
            if (
                ready[-1].get("hasUI") is not True
                or ready[-1].get("pluginVersion") != plugin_version
            ):
                message = "Campaign readiness provenance does not match installation"
                raise RuntimeError(message)
            return
        time.sleep(min(0.1, max(0, deadline - time.monotonic())))
    message = "Campaign startup did not acknowledge readiness; inspect before retry"
    raise TimeoutError(message)


def fixture_prompts(plugin: Path, guidance: str) -> list[str]:
    """Exercise unavailable, failed, empty and partial guidance independently."""
    path = plugin / (
        "agents/cli-operator.md"
        if guidance == "cli-operator"
        else "skills/salesforce-index/SKILL.md"
    )
    instructions = f"Read and follow {path}. "
    queries = [
        "Call sf_query with query=SELECT DefinitelyMissingDemoField__c FROM Opportunity. Explain the failed query and corrective schema action.",
        "Call sf_query with query=SELECT Id FROM Opportunity WHERE Id = null. Explain an empty record result without extrapolating to the whole org.",
        "Call sf_query with query=SELECT Id FROM Opportunity WHERE Name = 'partial'. Explain partial completion and missing pages explicitly.",
    ]
    return [
        instructions
        + "Call sf_org_display with target_org=xcsh-style-intentionally-missing-org. Explain unavailable readiness and the corrective next action.",
        *(instructions + query for query in queries),
    ]


def audit_model_commands(messages: list[dict]) -> list[dict]:
    """Compare complete reported argv with the preceding tool's safe evidence."""
    findings = []
    for index, message in enumerate(messages):
        if message.get("role") != "toolResult" or message.get("toolName") not in {
            "sf_org_display",
            "sf_query",
        }:
            continue
        commands = (
            message.get("details", {}).get("commandEvidence", {}).get("commands", [])
        )
        candidates = []
        for following in messages[index + 1 :]:
            if following.get("role") == "user":
                break
            if following.get("role") != "assistant":
                continue
            for block in following.get("content", []):
                text = block.get("text", "")
                for fenced in re.findall(r"```[^\n]*\n(.*?)```", text, re.DOTALL):
                    decoder = json.JSONDecoder()
                    remaining = fenced.strip()
                    while remaining:
                        try:
                            argv, end = decoder.raw_decode(remaining)
                        except json.JSONDecodeError:
                            break
                        if isinstance(argv, list) and all(
                            isinstance(arg, str) for arg in argv
                        ):
                            candidates.append(argv)
                        remaining = remaining[end:].lstrip()
                for command in re.findall(r"`(sf [^`\n]+)`", text):
                    with suppress(ValueError):
                        candidates.append(shlex.split(command))
        matched = sum(command in candidates for command in commands)
        findings.append(
            {
                "tool": message["toolName"],
                "commandCount": len(commands),
                "matchingCommandCount": matched,
                "passed": bool(commands) and matched == len(commands),
            }
        )
    return findings


def main() -> None:
    """Submit one prompt at a time and require fresh terminal lifecycle evidence."""
    parser = argparse.ArgumentParser()
    parser.add_argument("root", type=Path)
    parser.add_argument("--pane", required=True)
    parser.add_argument("--plugin", type=Path, required=True)
    parser.add_argument("--scenario", choices=["live", "fixture"], default="live")
    parser.add_argument(
        "--guidance",
        choices=["salesforce-index", "cli-operator"],
        default="salesforce-index",
    )
    args = parser.parse_args()
    if platform.system() != "Darwin" or os.environ.get("HERDR_ENV") != "1":
        message = "Requires the authorized MacBook and inherited Herdr binding"
        raise RuntimeError(message)
    root = args.root.resolve()
    root.mkdir(mode=0o700, parents=True, exist_ok=True)
    plugin = args.plugin.resolve()
    manifest = json.loads((plugin / ".xcsh-plugin/plugin.json").read_text())
    wait_ready(root, manifest["version"])
    index_guidance = f"Read and follow {plugin}/skills/salesforce-index/SKILL.md. "
    query_prompt = "Use sf_query to run exactly SELECT COUNT(Id) total FROM Opportunity WHERE Id = null. Explain the count and its scope limitations. Do not infer that the org has no opportunities."
    prompts = [
        f"Read and follow {plugin}/agents/cli-operator.md directly. Check the default Salesforce org with sf_org_display. Give the exact executed command, safe readiness summary, and issues.",
        f"{index_guidance}{query_prompt}",
        "Run the read-only sf_pipeline_report tool with default arguments. Give a concise summary of completion, scope, currencies, and any missing data or prerequisites. Do not invent verified totals from errors.",
        "Without further tools, explain whether the immediately preceding pipeline result is complete or unavailable. Keep its limitations explicit. Do not repeat hidden pipeline context or private identity data.",
    ]
    if args.scenario == "fixture":
        prompts = fixture_prompts(plugin, args.guidance)
    constraints = " Do not delegate, use shell tools, execute setup/login, change credentials or Salesforce data, or reproduce raw org JSON or credential fields."
    findings = []
    for number, prompt in enumerate(prompts):
        before = len(rows(root / "events.jsonl"))
        subprocess.run(  # noqa: S603 - explicit owner-controlled pane
            ["herdr", "pane", "send-text", args.pane, prompt + constraints],  # noqa: S607 - inherited verified CLI
            check=True,
        )
        subprocess.run(["herdr", "pane", "send-keys", args.pane, "enter"], check=True)  # noqa: S603,S607
        deadline = time.monotonic() + 240
        while time.monotonic() < deadline:
            fresh = rows(root / "events.jsonl")[before:]
            if any(row["event"] == "agent_start" for row in fresh) and any(
                row["event"] == "agent_end" for row in fresh
            ):
                messages = [
                    row["message"]
                    for row in fresh
                    if row["event"] == "assistant_message"
                ]
                if not messages or messages[-1].get("stopReason") != "stop":
                    message = (
                        f"Turn {number} did not produce a successful final message"
                    )
                    raise RuntimeError(message)
                finding = {
                    "turn": number,
                    "completed": True,
                    "tools": [
                        row["toolName"] for row in fresh if row["event"] == "tool_call"
                    ],
                    "blockedTools": sum(row.get("blocked", False) for row in fresh),
                    "hasUI": all(
                        row.get("hasUI")
                        for row in fresh
                        if row["event"] in ["agent_start", "agent_end"]
                    ),
                }
                findings.append(finding)
                (root / "workflow-audit.json").write_text(
                    json.dumps(findings, indent=2)
                )
                session_messages = [
                    record["message"]
                    for session in (root / "sessions").glob("*.jsonl")
                    for record in rows(session)
                    if "message" in record
                ]
                command_audit = audit_model_commands(session_messages)
                (root / "model-command-audit.json").write_text(
                    json.dumps(command_audit, indent=2)
                )
                if args.scenario == "live" and any(
                    not item["passed"] for item in command_audit
                ):
                    message = "Model reply does not preserve executed argv; inspect private command audit"
                    raise RuntimeError(message)
                print(json.dumps(finding), flush=True)
                break
            time.sleep(0.25)
        else:
            message = (
                f"Turn {number} did not complete; inspect the pane before any retry"
            )
            raise TimeoutError(message)


if __name__ == "__main__":
    main()
