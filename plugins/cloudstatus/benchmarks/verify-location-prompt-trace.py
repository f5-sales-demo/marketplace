#!/usr/bin/env python3
# pylint: disable=invalid-name,missing-function-docstring,too-many-branches,too-many-locals,too-many-statements
# ruff: noqa: D103, EM101, EM102, PLR2004, T201, TRY003, TRY004
"""Verify deterministic Cloudstatus Regional Edge tool traces from xcsh JSONL."""

from __future__ import annotations

import argparse
import base64
import binascii
import hashlib
import json
import re
import struct
from pathlib import Path
from typing import Any

PNG_SIGNATURE = b"\x89PNG\r\n\x1a\n"
SHA256_REF = re.compile(r"^blob:sha256:([a-f0-9]{64})$")


def parse_jsonl(jsonl: str) -> list[dict[str, Any]]:
    """Read only well-formed JSONL events, ignoring streaming noise safely."""
    events: list[dict[str, Any]] = []
    for line in jsonl.splitlines():
        try:
            item = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(item, dict):
            events.append(item)
    return events


def parse_trace(trace_path: Path) -> list[dict[str, Any]]:
    """Read a JSONL trace from disk."""
    return parse_jsonl(trace_path.read_text(encoding="utf-8"))


def tool_starts(events: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Return tool starts in execution order."""
    return [
        event
        for event in events
        if event.get("type") == "tool_execution_start" and event.get("toolName")
    ]


def tool_input(event: dict[str, Any]) -> dict[str, Any]:
    """Accommodate the stable xcsh args field and earlier trace aliases."""
    for key in ("args", "input", "arguments"):
        value = event.get(key)
        if isinstance(value, dict):
            return value
    return {}


def parse_png(png: bytes) -> tuple[int, int]:
    """Validate the structural PNG contract and return IHDR dimensions."""
    if not png.startswith(PNG_SIGNATURE):
        raise ValueError("invalid PNG signature")
    offset = len(PNG_SIGNATURE)
    chunks: list[bytes] = []
    dimensions: tuple[int, int] | None = None
    saw_idat = False
    saw_iend = False
    while offset < len(png):
        if len(png) - offset < 12:
            raise ValueError("invalid PNG chunk bounds")
        length = struct.unpack(">I", png[offset : offset + 4])[0]
        chunk_type = png[offset + 4 : offset + 8]
        data_start = offset + 8
        data_end = data_start + length
        crc_end = data_end + 4
        if crc_end > len(png):
            raise ValueError("invalid PNG chunk bounds")
        recorded_crc = struct.unpack(">I", png[data_end:crc_end])[0]
        actual_crc = binascii.crc32(chunk_type + png[data_start:data_end]) & 0xFFFFFFFF
        if recorded_crc != actual_crc:
            raise ValueError(
                f"invalid PNG CRC for {chunk_type.decode('ascii', 'replace')}"
            )
        if not chunks and chunk_type != b"IHDR":
            raise ValueError("PNG IHDR must be the first chunk")
        if chunk_type == b"IHDR":
            if chunks or length != 13:
                raise ValueError("invalid PNG IHDR")
            width, height = struct.unpack(">II", png[data_start : data_start + 8])
            if width <= 0 or height <= 0:
                raise ValueError("PNG dimensions must be positive")
            dimensions = (width, height)
        elif chunk_type == b"IDAT":
            if dimensions is None or saw_iend:
                raise ValueError("invalid PNG IDAT ordering")
            saw_idat = True
        elif chunk_type == b"IEND":
            if length != 0 or not saw_idat:
                raise ValueError("invalid PNG IEND")
            saw_iend = True
            if crc_end != len(png):
                raise ValueError("PNG contains data after IEND")
        chunks.append(chunk_type)
        offset = crc_end
    if dimensions is None:
        raise ValueError("PNG is missing IHDR")
    if not saw_idat:
        raise ValueError("PNG is missing IDAT")
    if not saw_iend or chunks[-1] != b"IEND":
        raise ValueError("PNG is missing IEND")
    return dimensions


def verify_media_result(completion: dict[str, Any]) -> tuple[dict[str, Any], bytes]:
    """Validate a successful canonical render_map result and return its receipt."""
    if completion.get("isError") is not False:
        raise ValueError("render_map completion reported an error")
    result = completion.get("result")
    if not isinstance(result, dict):
        raise ValueError("render_map completion is missing a result object")
    content = result.get("content")
    if not isinstance(content, list):
        raise ValueError("render_map result content must be an array")
    image_blocks = [
        block
        for block in content
        if isinstance(block, dict) and block.get("type") == "image"
    ]
    if len(image_blocks) != 1 or image_blocks[0].get("mimeType") != "image/png":
        raise ValueError("render_map must return exactly one image/png content block")
    encoded = image_blocks[0].get("data")
    if not isinstance(encoded, str):
        raise ValueError("image/png content is missing strict base64 data")
    try:
        png = base64.b64decode(encoded.encode("ascii"), validate=True)
    except (UnicodeEncodeError, ValueError, binascii.Error) as error:
        raise ValueError("image/png content is not strict base64") from error
    width, height = parse_png(png)

    details = result.get("details")
    if not isinstance(details, dict) or details.get("mediaResult") != "xcsh.media/v1":
        raise ValueError("render_map result is missing xcsh.media/v1 details")
    descriptor = details.get("descriptor")
    if not isinstance(descriptor, dict) or descriptor.get("version") != 1:
        raise ValueError("render_map result is missing a canonical media descriptor")
    if descriptor.get("kind") != "image":
        raise ValueError("canonical media descriptor kind must be image")
    if descriptor.get("width") != width or descriptor.get("height") != height:
        raise ValueError("descriptor dimensions do not match the PNG IHDR")
    original = descriptor.get("original")
    if not isinstance(original, dict) or original.get("mimeType") != "image/png":
        raise ValueError("descriptor.original must describe image/png")
    if original.get("bytes") != len(png):
        raise ValueError(
            "descriptor.original decoded byte count does not match the PNG"
        )
    digest = hashlib.sha256(png).hexdigest()
    ref_match = SHA256_REF.fullmatch(str(original.get("ref", "")))
    if ref_match is None or ref_match.group(1) != digest:
        raise ValueError("descriptor.original SHA-256 does not match the PNG")
    provenance = descriptor.get("provenance")
    metadata = descriptor.get("metadata")
    if (
        not isinstance(provenance, dict)
        or provenance.get("sourceType") != "tool"
        or provenance.get("source") != "render_map"
    ):
        raise ValueError("descriptor provenance must identify the render_map tool")
    if not isinstance(metadata, dict) or metadata.get("producer") != "render_map":
        raise ValueError("descriptor metadata producer must be render_map")
    if details.get("displayMethod") != "inline":
        raise ValueError("canonical media displayMethod must be inline")
    basemap = metadata.get("basemap")
    if not isinstance(basemap, str) or not basemap:
        raise ValueError("descriptor metadata must include a basemap")
    return (
        {
            "dimensions": [width, height],
            "bytes": len(png),
            "sha256": digest,
            "basemap": basemap,
        },
        png,
    )


def analyze_trace(
    scenario: dict[str, Any], jsonl: str
) -> tuple[dict[str, Any], bytes | None]:
    """Evaluate one scenario and retain verified PNG bytes only for extraction."""
    events = parse_jsonl(jsonl)
    starts = tool_starts(events)
    tools = [str(event["toolName"]) for event in starts]
    errors: list[str] = []
    image_receipt: dict[str, Any] | None = None
    png: bytes | None = None

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

    render_starts = [event for event in starts if event["toolName"] == "render_map"]
    render_completions = [
        event
        for event in events
        if event.get("type") == "tool_execution_end"
        and event.get("toolName") == "render_map"
    ]
    completion_ids = [str(event.get("toolCallId", "")) for event in render_completions]
    duplicate_completion_ids = sorted(
        {value for value in completion_ids if completion_ids.count(value) > 1}
    )
    if duplicate_completion_ids:
        errors.append(
            f"duplicate render_map completion IDs: {', '.join(duplicate_completion_ids)}"
        )

    visual = scenario["intent"] == "visual"
    expected_renders = 1 if visual else 0
    if len(render_starts) != expected_renders:
        errors.append(
            f"expected {expected_renders} render_map starts, found {len(render_starts)}"
        )
    if len(render_completions) != expected_renders:
        errors.append(
            f"expected {expected_renders} render_map completions, found {len(render_completions)}"
        )

    paired = False
    if visual and len(render_starts) == 1 and len(render_completions) == 1:
        start_id = render_starts[0].get("toolCallId")
        completion_id = render_completions[0].get("toolCallId")
        paired = (
            isinstance(start_id, str) and start_id != "" and start_id == completion_id
        )
        if paired:
            try:
                image_receipt, png = verify_media_result(render_completions[0])
            except ValueError as error:
                errors.append(str(error))
        else:
            errors.append(
                "expected one successful render_map start/completion pair with the same toolCallId"
            )
    elif visual:
        errors.append("expected one successful render_map start/completion pair")

    image_events = [
        event
        for event in events
        if event.get("type") == "tool_execution_end"
        and isinstance(event.get("result"), dict)
        and isinstance(event["result"].get("content"), list)
        and any(
            isinstance(block, dict) and block.get("type") == "image"
            for block in event["result"]["content"]
        )
    ]
    if not visual and image_events:
        errors.append("factual scenario returned image content")

    errors.extend(
        f"forbidden tool invoked: {forbidden}"
        for forbidden in ("task", "web_search", "display_media")
        if forbidden in tools
    )
    ordering_valid = True
    if skill_reads and collector_starts and skill_reads[0] > collector_starts[0]:
        errors.append("cloudstatus:location must be read before the collector")
        ordering_valid = False
    render_indices = [
        index for index, event in enumerate(starts) if event["toolName"] == "render_map"
    ]
    if render_indices and collector_starts and collector_starts[0] > render_indices[0]:
        errors.append("collector must run before render_map")
        ordering_valid = False

    claims = {
        "location_skill_read_once": len(skill_reads) == 1,
        "registry_collector_once": len(collector_starts) == 1,
        "forbidden_tools_absent": not any(
            name in tools for name in ("task", "web_search", "display_media")
        ),
        "tool_ordering_valid": ordering_valid,
        "successful_render_pair": visual and paired and image_receipt is not None,
        "valid_png": visual and image_receipt is not None,
        "zero_image_generation": not visual
        and not render_starts
        and not render_completions
        and not image_events,
    }
    receipt = {"claims": claims, "image": image_receipt, "toolOrdering": tools}
    return {
        "pass": not errors,
        "tools": tools,
        "errors": errors,
        "receipt": receipt,
    }, png


def evaluate_trace(scenario: dict[str, Any], jsonl: str) -> dict[str, Any]:
    """Evaluate one scenario without returning or printing encoded image bytes."""
    result, _png = analyze_trace(scenario, jsonl)
    return result


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("scenarios", type=Path)
    parser.add_argument("scenario_id")
    parser.add_argument("trace", type=Path)
    parser.add_argument("--receipt", type=Path)
    parser.add_argument("--extract-png", type=Path)
    args = parser.parse_args()
    scenarios = json.loads(args.scenarios.read_text(encoding="utf-8"))["scenarios"]
    scenario = next(
        (item for item in scenarios if item["id"] == args.scenario_id), None
    )
    if scenario is None:
        raise ValueError(f"unknown scenario: {args.scenario_id}")
    result, png = analyze_trace(scenario, args.trace.read_text(encoding="utf-8"))
    output = {
        "scenario": scenario["id"],
        "pass": result["pass"],
        **result["receipt"],
        "errors": result["errors"],
    }
    compact = json.dumps(output, separators=(",", ":"), sort_keys=True)
    print(compact)
    if args.receipt:
        args.receipt.write_text(compact + "\n", encoding="utf-8")
    if args.extract_png and png is not None:
        args.extract_png.write_bytes(png)
    return 0 if result["pass"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
