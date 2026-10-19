# Standalone unittest runner, not an import package.
# ruff: noqa: INP001, PT027
# unittest is the repository standalone runner; keep it dependency-free.
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path

MODULE = Path(__file__).resolve().parents[1] / "scripts" / "drive-salesforce-capture.py"
spec = importlib.util.spec_from_file_location("capture_driver", MODULE)
assert spec is not None
assert spec.loader is not None
driver = importlib.util.module_from_spec(spec)
spec.loader.exec_module(driver)

STARTER = MODULE.with_name("start-salesforce-capture.py")
start_spec = importlib.util.spec_from_file_location("capture_starter", STARTER)
assert start_spec is not None
assert start_spec.loader is not None
starter = importlib.util.module_from_spec(start_spec)
start_spec.loader.exec_module(starter)


class NativeCaptureChecks(unittest.TestCase):
    def test_remaining_outcomes_are_independent_and_fixture_only(self):
        cases = starter.cases("fixture", "remaining")
        assert len(cases) == 24
        assert len({case["id"] for case in cases}) == 24
        for tool in {case["tool"] for case in cases}:
            assert {
                case["fixtureOutcome"] for case in cases if case["tool"] == tool
            } == {"empty", "unavailable", "partial", "failed"}
        assert len({case["tool"] for case in cases}) == 6
        assert all(case["expectedText"] for case in cases)
        with self.assertRaises(ValueError):
            starter.cases("live", "remaining")

    def test_case_selection_rejects_unknown_and_duplicate_ids(self):
        available = starter.cases("fixture", "remaining")
        selected = starter.select_cases(available, ["sf_pipeline_report-empty"])
        assert [case["id"] for case in selected] == ["sf_pipeline_report-empty"]
        assert starter.select_cases(available, []) == available
        for ids in (["unknown"], ["sf_query-empty", "sf_query-empty"]):
            with self.assertRaises(ValueError):
                starter.select_cases(available, ids)

    def test_outcome_evidence_is_checked_after_terminal_reflow(self):
        case = {
            "id": "fault",
            "tool": "sf_pipeline_report",
            "args": {},
            "expectedError": True,
            "expectedText": ["Select an authenticated target_org"],
        }
        frame = {
            "id": "fault",
            "width": 40,
            "terminalColumns": 160,
            "theme": "xcsh-dark",
            "preset": "ascii",
            "expanded": False,
            "resultIsError": True,
            "lines": ["| Select an authenticated |", "| target_org |"],
        }
        with tempfile.TemporaryDirectory() as root:
            assert driver.inspect_frame(Path(root), frame, case)["passed"]
            frame["lines"] = ["unexplained error"]
            assert not driver.inspect_frame(Path(root), frame, case)["passed"]

    def test_width_uses_visible_cells_not_ansi_or_combining_marks(self):
        assert driver.columns("\x1b[31m北方\x1b[0m") == 4
        assert driver.columns("é") == 1
        assert driver.columns("false") == 5

    def test_actual_frame_command_is_reconstructed_in_both_shells(self):
        query = (
            "SELECT Id FROM Opportunity WHERE Name = '$HOME $(printf safe) ; | 北方'"
        )
        # Quote literal query with adjacent POSIX chunks across an escaped newline.
        encoded = "'" + query.replace("'", "'\\''") + "'"
        command = "sf data query --query \\\n" + encoded + " --json"
        rows = ["│ " + part + " │" for part in command.splitlines()]
        frame = {
            "lines": rows,
            "commands": [{"argv": ["sf", "data", "query", "--query", query, "--json"]}],
        }
        case = {"tool": "sf_query", "args": {"query": query}}
        with tempfile.TemporaryDirectory() as root:
            result = driver.verify_commands(
                Path(root),
                frame,
                case,
                required_shells=tuple(
                    shell
                    for shell in ("/bin/bash", "/bin/zsh")
                    if Path(shell).is_file()
                ),
            )
        assert result["passed"], result

    def test_geometry_requires_fresh_same_installation_evidence(self):
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "frames").mkdir()
            ready = {
                "runtimeVersion": "23.8.0",
                "pluginVersion": "2.3.12",
                "binary": "/synthetic/xcsh",
                "terminalColumns": 150,
            }
            (root / "ready.json").write_text(json.dumps(ready))
            (root / "manifest.json").write_text(json.dumps(ready))
            frame = {**ready, "terminalColumns": 160}
            path = root / "frames" / "geometry.json"
            path.write_text(json.dumps(frame))
            assert (
                driver.terminal_allocation(root, ready, "geometry.json", [153]) == 160
            )
            for key in ["runtimeVersion", "pluginVersion", "binary"]:
                path.write_text(json.dumps({**frame, key: "wrong"}))
                with self.assertRaises(ValueError):
                    driver.terminal_allocation(root, ready, "geometry.json", [153])
            path.write_text(json.dumps(frame))
            os.utime(path, (1, 1))
            with self.assertRaises(ValueError):
                driver.terminal_allocation(root, ready, "geometry.json", [153])
            with self.assertRaises(ValueError):
                driver.terminal_allocation(root, ready, "../geometry.json", [153])
            with self.assertRaises(ValueError):
                driver.terminal_allocation(root, ready, None, [153])

    def test_frame_rejects_insufficient_or_missing_terminal_allocation(self):
        frame = {
            "id": "x",
            "width": 153,
            "theme": "xcsh-dark",
            "preset": "ascii",
            "expanded": False,
            "lines": ["result"],
            "resultIsError": False,
        }
        case = {"id": "pipeline", "tool": "sf_pipeline_report", "args": {}}
        with tempfile.TemporaryDirectory() as root:
            for allocation in [None, 150]:
                if allocation is not None:
                    frame["terminalColumns"] = allocation
                result = driver.inspect_frame(Path(root), frame, case)
                assert "terminal-allocation-too-narrow" in result["failures"]
            frame["terminalColumns"] = 160
            assert driver.inspect_frame(Path(root), frame, case)["passed"]

    def test_overflow_and_missing_value_are_not_accepted(self):
        frame = {
            "id": "x",
            "width": 3,
            "theme": "xcsh-dark",
            "preset": "ascii",
            "expanded": False,
            "lines": ["too wide"],
            "resultIsError": False,
        }
        case = {"id": "query-zero", "tool": "sf_pipeline_report", "args": {}}
        with tempfile.TemporaryDirectory() as root:
            result = driver.inspect_frame(Path(root), frame, case)
        assert "overflow" in result["failures"]
        assert "zero-not-visible" in result["failures"]


if __name__ == "__main__":
    unittest.main()
