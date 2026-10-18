# Standalone unittest runner, not an import package.
# ruff: noqa: INP001
import importlib.util
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
        frame = {"lines": rows, "commands": [{"argv": ["sf", "data", "query", "--query", query, "--json"]}]}
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
