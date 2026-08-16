#!/usr/bin/env python3
# ruff: noqa: D103, EM102, PLR2004, T201, TRY003
"""Verify deterministic Cloudstatus Regional Edge tool traces from xcsh JSONL."""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any


def parse_trace(trace_path: Path) -> list[dict[str, Any]]:
    """Read only well-formed JSONL events, ignoring streaming noise safely."""
    events: list[dict[str, Any]] = []
    for line in trace_path.read_text(encoding="utf-8").splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            events.append(item)
    return events


def tool_starts(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return completed tool starts in the order xcsh executed them."""
    return [
        event
        for event in events
        if event.get("type") == "tool_execution_start" and event.get("toolName")
    ]


def tool_input(event: dict[str, Any]) -> dict[str, Any]:
    """Accommodate the stable xcsh input field and earlier trace aliases."""
    for key in ("input", "args", "arguments"):
        value = event.get(key)
        if isinstance(value, dict):
            return value
    return {}


def evaluate_trace(scenario: dict[str, Any], jsonl: str) -> dict[str, Any]:
    """Evaluate one scenario without interpreting model prose or live results."""
    events: list[dict[str, Any]] = []
    for line in jsonl.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            events.append(item)
    starts = tool_starts(events)
    tools = [str(event["toolName"]) for event in starts]
    errors: list[str] = []

    skill_reads = [
        index
        for index, event in enumerate(starts)
        if event["toolName"] == "read"
        and "cloudstatus/location" in str(tool_input(event).get("path", ""))
    ]
    if len(skill_reads) != 1:
        errors.append(
            f"expected one cloudstatus location skill read, found {len(skill_reads)}"
        )

    collector = str(scenario["collector"])
    collector_starts = [
        index
        for index, event in enumerate(starts)
        if event["toolName"] == "bash"
        and "network_lookup.py" in str(tool_input(event).get("command", ""))
    ]
    if len(collector_starts) != 1:
        errors.append(
            f"expected one registry collector Bash call, found {len(collector_starts)}"
        )
    elif collector not in str(
        tool_input(starts[collector_starts[0]]).get("command", "")
    ):
        errors.append(f"collector must use {collector!r}")

    render_starts = [
        index for index, event in enumerate(starts) if event["toolName"] == "render_map"
    ]
    expected_renders = 1 if scenario["intent"] == "visual" else 0
    if len(render_starts) != expected_renders:
        errors.append(
            f"expected {expected_renders} render_map calls, found {len(render_starts)}"
        )

    errors.extend(
        f"forbidden tool invoked: {forbidden}"
        for forbidden in ("task", "web_search", "display_media")
        if forbidden in tools
    )

    if skill_reads and collector_starts and skill_reads[0] > collector_starts[0]:
        errors.append("cloudstatus:location must be read before the collector")
    if render_starts and collector_starts and collector_starts[0] > render_starts[0]:
        errors.append("collector must run before render_map")

    return {"pass": not errors, "tools": tools, "errors": errors}


def main() -> int:
    if len(sys.argv) != 4:
        print(
            "usage: verify-location-prompt-trace.py <scenarios.json> <scenario-id> <trace.jsonl>",
            file=sys.stderr,
        )
        return 2
    scenarios = json.loads(Path(sys.argv[1]).read_text(encoding="utf-8"))["scenarios"]
    scenario = next((item for item in scenarios if item["id"] == sys.argv[2]), None)
    if scenario is None:
        raise ValueError(f"unknown scenario: {sys.argv[2]}")
    result = evaluate_trace(scenario, Path(sys.argv[3]).read_text(encoding="utf-8"))
    print(json.dumps({"scenario": scenario["id"], **result}, indent=2))
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
