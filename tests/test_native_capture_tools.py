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


class NativeCaptureChecks(unittest.TestCase):
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
