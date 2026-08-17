# ruff: noqa: D101, D102, D103, EM102, INP001, PT009, S603, TC003, TRY003
# pylint: disable=line-too-long,missing-class-docstring,missing-function-docstring,too-many-arguments
"""Hermetic trace-contract tests for Cloudstatus Regional Edge prompt routing."""

from __future__ import annotations

import base64
import binascii
import hashlib
import importlib.util
import json
import os
import pathlib
import struct
import subprocess
import sys
import tempfile
import unittest
import zlib
from types import ModuleType
from typing import Any

PLUGIN_ROOT = pathlib.Path(__file__).resolve().parents[2]
VERIFIER_PATH = PLUGIN_ROOT / "benchmarks/verify-location-prompt-trace.py"


def load_verifier() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "cloudstatus_location_trace", VERIFIER_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {VERIFIER_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


def trace(*events: dict[str, Any]) -> str:
    return "\n".join(json.dumps(event) for event in events)


def start(
    name: str, input_value: dict[str, Any], call_id: str | None = None
) -> dict[str, Any]:
    return {
        "type": "tool_execution_start",
        "toolCallId": call_id or f"{name}-call",
        "toolName": name,
        "args": input_value,
    }


def png_chunk(chunk_type: bytes, data: bytes) -> bytes:
    crc = binascii.crc32(chunk_type + data) & 0xFFFFFFFF
    return struct.pack(">I", len(data)) + chunk_type + data + struct.pack(">I", crc)


def valid_png(width: int = 2, height: int = 3) -> bytes:
    rows = b"".join(b"\x00" + (b"\x00\x00\x00\xff" * width) for _ in range(height))
    return b"".join(
        (
            b"\x89PNG\r\n\x1a\n",
            png_chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)),
            png_chunk(b"IDAT", zlib.compress(rows)),
            png_chunk(b"IEND", b""),
        )
    )


def render_result(
    *,
    call_id: str = "render-call",
    image: bytes | None = None,
    image_data: str | None = None,
    is_error: bool = False,
    details: Any | None = None,
    width: int = 2,
    height: int = 3,
) -> dict[str, Any]:
    payload = valid_png(width, height) if image is None else image
    digest = hashlib.sha256(payload).hexdigest()
    if details is None:
        details = {
            "mediaResult": "xcsh.media/v1",
            "descriptor": {
                "version": 1,
                "id": f"media_{digest[:24]}",
                "kind": "image",
                "width": width,
                "height": height,
                "original": {
                    "ref": f"blob:sha256:{digest}",
                    "mimeType": "image/png",
                    "bytes": len(payload),
                },
                "provenance": {"sourceType": "tool", "source": "render_map"},
                "metadata": {"producer": "render_map", "basemap": "schematic"},
            },
            "displayMethod": "inline",
        }
    content: list[dict[str, Any]] = [
        {
            "type": "image",
            "mimeType": "image/png",
            "data": image_data
            if image_data is not None
            else base64.b64encode(payload).decode("ascii"),
        },
        {"type": "text", "text": "evidence"},
    ]
    return {
        "type": "tool_execution_end",
        "toolCallId": call_id,
        "toolName": "render_map",
        "isError": is_error,
        "result": {"content": content, "details": details},
    }


def workflow(*render_events: dict[str, Any]) -> str:
    return trace(
        start("read", {"path": "skill://cloudstatus/location"}),
        start(
            "bash",
            {
                "command": 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
            },
        ),
        start("render_map", {"locations": []}, "render-call"),
        *render_events,
    )


VISUAL = {"intent": "visual", "collector": "locations --format map-v1"}
FACTUAL = {"intent": "factual", "collector": "location"}


class LocationPromptTraceTests(unittest.TestCase):
    verifier: ModuleType

    @classmethod
    def setUpClass(cls) -> None:
        cls.verifier = load_verifier()

    def assert_error(self, result: dict[str, Any], fragment: str) -> None:
        self.assertFalse(result["pass"])
        self.assertTrue(
            any(fragment in error for error in result["errors"]), result["errors"]
        )

    def test_visual_trace_requires_one_successful_render_pair(self) -> None:
        result = self.verifier.evaluate_trace(VISUAL, workflow(render_result()))
        self.assertTrue(result["pass"], result["errors"])
        self.assertEqual(result["receipt"]["claims"]["valid_png"], True)
        self.assertEqual(result["receipt"]["image"]["dimensions"], [2, 3])

    def test_rejects_render_start_without_completion(self) -> None:
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow()),
            "successful render_map start/completion pair",
        )

    def test_rejects_mismatched_and_duplicate_completion_ids(self) -> None:
        mismatched = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(call_id="other-call"))
        )
        self.assert_error(mismatched, "successful render_map start/completion pair")
        duplicate = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(), render_result())
        )
        self.assert_error(duplicate, "duplicate render_map completion")

    def test_rejects_errored_text_only_and_missing_descriptor_results(self) -> None:
        errored = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(is_error=True))
        )
        self.assert_error(errored, "render_map completion reported an error")

        text_only = render_result()
        text_only["result"]["content"] = [{"type": "text", "text": "fallback"}]
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(text_only)),
            "exactly one image/png content block",
        )

        missing_descriptor = render_result(details={"mediaResult": "xcsh.media/v1"})
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(missing_descriptor)),
            "canonical media descriptor",
        )

        wrong_source_type = render_result()
        wrong_source_type["result"]["details"]["descriptor"]["provenance"][
            "sourceType"
        ] = "model"
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(wrong_source_type)),
            "provenance",
        )

    def test_rejects_invalid_base64_png_structure_and_crc(self) -> None:
        invalid_base64 = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(image_data="%%%"))
        )
        self.assert_error(invalid_base64, "strict base64")

        invalid_structure = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(image=b"not a png"))
        )
        self.assert_error(invalid_structure, "PNG signature")

        bad_crc = bytearray(valid_png())
        bad_crc[-1] ^= 0x01
        invalid_crc = self.verifier.evaluate_trace(
            VISUAL, workflow(render_result(image=bytes(bad_crc)))
        )
        self.assert_error(invalid_crc, "PNG CRC")

    def test_rejects_dimensions_byte_count_and_sha_mismatches(self) -> None:
        dimensions = render_result()
        dimensions["result"]["details"]["descriptor"]["width"] = 99
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(dimensions)),
            "descriptor dimensions",
        )

        byte_count = render_result()
        byte_count["result"]["details"]["descriptor"]["original"]["bytes"] += 1
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(byte_count)),
            "decoded byte count",
        )

        digest = render_result()
        digest["result"]["details"]["descriptor"]["original"]["ref"] = (
            "blob:sha256:" + ("0" * 64)
        )
        self.assert_error(
            self.verifier.evaluate_trace(VISUAL, workflow(digest)), "SHA-256"
        )

    def test_factual_trace_succeeds_without_render_or_image(self) -> None:
        result = self.verifier.evaluate_trace(
            FACTUAL,
            trace(
                start("read", {"path": "skill://cloudstatus/location"}),
                start(
                    "bash",
                    {"command": 'network_lookup.py location "$CLOUDSTATUS_QUERY"'},
                ),
            ),
        )
        self.assertTrue(result["pass"], result["errors"])
        self.assertEqual(result["receipt"]["claims"]["zero_image_generation"], True)

    def test_factual_trace_rejects_any_render_or_image(self) -> None:
        result = self.verifier.evaluate_trace(
            FACTUAL,
            trace(
                start("read", {"path": "skill://cloudstatus/location"}),
                start(
                    "bash",
                    {"command": 'network_lookup.py location "$CLOUDSTATUS_QUERY"'},
                ),
                render_result(),
            ),
        )
        self.assert_error(result, "expected 0 render_map")
        self.assert_error(result, "factual scenario returned image content")

    def test_rejects_duplicate_collector_forbidden_tools_and_wrong_order(self) -> None:
        result = self.verifier.evaluate_trace(
            VISUAL,
            trace(
                start(
                    "bash",
                    {
                        "command": 'network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                    "collector-1",
                ),
                start("web_search", {"query": "F5 Regional Edge"}),
                start(
                    "bash",
                    {
                        "command": 'network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                    "collector-2",
                ),
                start("task", {}),
                start("display_media", {}),
                start("render_map", {"locations": []}, "render-call"),
                render_result(),
            ),
        )
        self.assert_error(result, "expected one registry collector Bash call, found 2")
        self.assert_error(result, "forbidden tool invoked: task")
        self.assert_error(
            result, "expected one cloudstatus location skill read, found 0"
        )

    def test_cli_writes_compact_receipt_and_png_without_base64(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            scenarios = root / "scenarios.json"
            trace_path = root / "trace.jsonl"
            receipt = root / "trace.receipt.json"
            png_path = root / "trace.png"
            scenarios.write_text(
                json.dumps({"scenarios": [{"id": "visual", **VISUAL}]}),
                encoding="utf-8",
            )
            trace_path.write_text(workflow(render_result()), encoding="utf-8")
            completed = subprocess.run(
                [
                    sys.executable,
                    str(VERIFIER_PATH),
                    str(scenarios),
                    "visual",
                    str(trace_path),
                    "--receipt",
                    str(receipt),
                    "--extract-png",
                    str(png_path),
                ],
                check=False,
                capture_output=True,
                text=True,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            self.assertEqual(png_path.read_bytes(), valid_png())
            receipt_text = receipt.read_text(encoding="utf-8")
            self.assertNotIn(
                base64.b64encode(valid_png()).decode("ascii"), receipt_text
            )
            parsed = json.loads(receipt_text)
            self.assertEqual(
                parsed["image"]["sha256"], hashlib.sha256(valid_png()).hexdigest()
            )
            self.assertNotIn("data", parsed)

    def test_uat_runner_retains_receipt_and_png_in_requested_artifact_dir(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = pathlib.Path(temporary)
            artifact_dir = root / "artifacts"
            fake_xcsh = root / "xcsh"
            fake_xcsh.write_text(
                "#!/usr/bin/env bash\nprintf '%s\\n' \"$FAKE_XCSH_TRACE\"\n",
                encoding="utf-8",
            )
            fake_xcsh.chmod(0o755)
            environment = {
                **os.environ,
                "XCSH_BIN": str(fake_xcsh),
                "FAKE_XCSH_TRACE": workflow(render_result()),
                "LOCATION_UAT_ARTIFACT_DIR": str(artifact_dir),
            }
            completed = subprocess.run(
                [
                    "/bin/bash",
                    str(PLUGIN_ROOT / "scripts/evals/run-location-prompt-eval.sh"),
                    "visual-address-us",
                    "test-model",
                ],
                check=False,
                capture_output=True,
                text=True,
                env=environment,
            )
            self.assertEqual(completed.returncode, 0, completed.stderr)
            receipt = artifact_dir / "visual-address-us-1.receipt.json"
            png_path = artifact_dir / "visual-address-us-1.png"
            self.assertTrue(receipt.is_file())
            self.assertEqual(png_path.read_bytes(), valid_png())
            encoded = base64.b64encode(valid_png()).decode("ascii")
            self.assertNotIn(encoded, completed.stdout)
            self.assertNotIn(encoded, receipt.read_text(encoding="utf-8"))

    def test_exact_address_map_regression_is_a_visual_collector_scenario(self) -> None:
        scenarios = json.loads(
            (PLUGIN_ROOT / "benchmarks/location-prompt-scenarios.json").read_text(
                encoding="utf-8"
            )
        )["scenarios"]
        scenario = next(item for item in scenarios if item["id"] == "visual-address-us")
        self.assertEqual(scenario["intent"], "visual")
        self.assertEqual(scenario["collector"], "locations --format map-v1")


if __name__ == "__main__":
    unittest.main()
