# ruff: noqa: D101, D102, D103, EM102, INP001, PT009, TC003, TRY003
"""Hermetic trace-contract tests for Cloudstatus Regional Edge prompt routing."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import sys
import unittest
from types import ModuleType

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


def trace(*events: dict[str, object]) -> str:
    return "\n".join(json.dumps(event) for event in events)


def start(name: str, input_value: dict[str, object]) -> dict[str, object]:
    return {"type": "tool_execution_start", "toolName": name, "input": input_value}


class LocationPromptTraceTests(unittest.TestCase):
    verifier: ModuleType

    @classmethod
    def setUpClass(cls) -> None:
        cls.verifier = load_verifier()

    def test_visual_trace_requires_location_collector_then_one_renderer(self) -> None:
        result = self.verifier.evaluate_trace(
            {"intent": "visual", "collector": "locations --format map-v1"},
            trace(
                start("read", {"path": "skill://cloudstatus/location"}),
                start(
                    "bash",
                    {
                        "command": 'python3 skill://cloudstatus:network-intelligence/scripts/network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                ),
                start("render_map", {"locations": []}),
            ),
        )
        self.assertTrue(result["pass"], result["errors"])

    def test_factual_trace_rejects_a_renderer(self) -> None:
        result = self.verifier.evaluate_trace(
            {"intent": "factual", "collector": "location"},
            trace(
                start("read", {"path": "skill://cloudstatus/location"}),
                start(
                    "bash",
                    {"command": 'network_lookup.py location "$CLOUDSTATUS_QUERY"'},
                ),
                start("render_map", {"locations": []}),
            ),
        )
        self.assertFalse(result["pass"])
        self.assertIn("expected 0 render_map calls, found 1", result["errors"])

    def test_rejects_duplicate_collector_and_forbidden_tools(self) -> None:
        result = self.verifier.evaluate_trace(
            {"intent": "visual", "collector": "locations --format map-v1"},
            trace(
                start("read", {"path": "skill://cloudstatus/location"}),
                start(
                    "bash",
                    {
                        "command": 'network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                ),
                start("web_search", {"query": "F5 Regional Edge"}),
                start(
                    "bash",
                    {
                        "command": 'network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                ),
                start("task", {}),
                start("display_media", {}),
                start("render_map", {"locations": []}),
            ),
        )
        self.assertFalse(result["pass"])
        self.assertIn(
            "expected one registry collector Bash call, found 2", result["errors"]
        )
        self.assertIn("forbidden tool invoked: task", result["errors"])
        self.assertIn("forbidden tool invoked: web_search", result["errors"])
        self.assertIn("forbidden tool invoked: display_media", result["errors"])

    def test_rejects_wrong_order_and_missing_skill_read(self) -> None:
        result = self.verifier.evaluate_trace(
            {"intent": "visual", "collector": "locations --format map-v1"},
            trace(
                start(
                    "bash",
                    {
                        "command": 'network_lookup.py locations --format map-v1 "$CLOUDSTATUS_QUERY"'
                    },
                ),
                start("render_map", {"locations": []}),
            ),
        )
        self.assertFalse(result["pass"])
        self.assertIn(
            "expected one cloudstatus location skill read, found 0", result["errors"]
        )


if __name__ == "__main__":
    unittest.main()
