# ruff: noqa: D101, D102, D103, EM102, INP001, PT009, PT027, TC003, TRY003
# pylint: disable=line-too-long,missing-class-docstring,missing-function-docstring
"""Hermetic tests for live Regional Edge UAT prompt synthesis."""

from __future__ import annotations

import importlib.util
import pathlib
import sys
import unittest
from types import ModuleType

PLUGIN_ROOT = pathlib.Path(__file__).resolve().parents[2]
SYNTHESIS_PATH = PLUGIN_ROOT / "scripts/evals/synthesize-location-prompt-uats.py"


def load_synthesis() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "location_prompt_synthesis", SYNTHESIS_PATH
    )
    if spec is None or spec.loader is None:
        raise RuntimeError(f"cannot load {SYNTHESIS_PATH}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


class LocationPromptSynthesisTests(unittest.TestCase):
    synthesis: ModuleType

    @classmethod
    def setUpClass(cls) -> None:
        cls.synthesis = load_synthesis()

    def test_synthesizes_address_map_variants_from_the_exact_regression(self) -> None:
        variants = self.synthesis.synthesize("visual-address-us", 4)
        self.assertEqual(len(variants), 4)
        self.assertEqual(variants[0]["id"], "visual-address-us")
        self.assertEqual(
            variants[0]["prompt"],
            "show me a map of all the address locations of the F5 regional edges that are located in the united states",
        )
        self.assertIn("Regional Edge", variants[1]["prompt"])
        self.assertIn("United States as the registry filter", variants[3]["prompt"])

    def test_rejects_unknown_scenarios_and_non_positive_counts(self) -> None:
        with self.assertRaises(ValueError):
            self.synthesis.synthesize("unknown", 1)
        with self.assertRaises(ValueError):
            self.synthesis.synthesize("visual-address-us", 0)


if __name__ == "__main__":
    unittest.main()
