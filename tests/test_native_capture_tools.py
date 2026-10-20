# Standalone unittest runner, not an import package.
# ruff: noqa: INP001, PT027
# unittest is the repository standalone runner; keep it dependency-free.
import gzip
import hashlib
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

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
    def test_representative_scroll_inspects_boundaries_middle_and_final_rows(self):
        surface_spec = importlib.util.spec_from_file_location(
            "surface_sampling", MODULE.with_name("drive-salesforce-surface-capture.py")
        )
        assert surface_spec is not None
        assert surface_spec.loader is not None
        surface = importlib.util.module_from_spec(surface_spec)
        surface_spec.loader.exec_module(surface)
        finding = {"offset": 0, "pageLines": 45, "totalLines": 74144}
        offsets = [0]
        while True:
            offset = surface.next_page_offset(finding, "representative")
            if offset is None:
                break
            offsets.append(offset)
            finding = {**finding, "offset": offset}
        assert len(offsets) == 5
        assert offsets[:2] == [0, 44]
        assert offsets[-1] + finding["pageLines"] == finding["totalLines"]
        assert 30000 < offsets[2] < 40000
        assert (
            surface.next_page_offset(
                {"offset": 0, "pageLines": 45, "totalLines": 30}, "representative"
            )
            is None
        )
        assert (
            surface.next_page_offset(
                {"offset": 0, "pageLines": 45, "totalLines": 90}, "representative"
            )
            == 44
        )
        assert (
            surface.next_page_offset(
                {"offset": 0, "pageLines": 45, "totalLines": 74144}, "full"
            )
            == 44
        )
        with self.assertRaises(ValueError):
            surface.next_page_offset(finding, "unknown")

    def test_capture_retirement_requires_shutdown_and_matching_server(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "manifest.json").write_text(json.dumps({"completed": False}))
            with (
                patch.object(starter.subprocess, "check_output") as command,
                self.assertRaises(ValueError),
            ):
                starter.retire_owned_capture(root)
            command.assert_not_called()
            (root / "manifest.json").write_text(
                json.dumps({"completed": True, "lifecycle": []})
            )
            with self.assertRaises(ValueError):
                starter.retire_owned_capture(root)
            (root / "manifest.json").write_text(
                json.dumps(
                    {"completed": True, "lifecycle": [{"event": "session_shutdown"}]}
                )
            )
            (root / "owned-pane.json").write_text(
                json.dumps(
                    {
                        "pane": "owned",
                        "originalPane": "user",
                        "workspace": "workspace",
                        "serverBinding": "wrong",
                    }
                )
            )
            with (
                patch.object(
                    starter.subprocess,
                    "check_output",
                    return_value=json.dumps({"socket": "socket", "protocol": 27}),
                ),
                self.assertRaises(ValueError),
            ):
                starter.retire_owned_capture(root)

    def test_capture_retirement_accepts_only_confirmed_owned_pane_absence(self):
        with tempfile.TemporaryDirectory() as folder:
            root = Path(folder)
            (root / "manifest.json").write_text(
                json.dumps(
                    {"completed": True, "lifecycle": [{"event": "session_shutdown"}]}
                )
            )
            (root / "owned-pane.json").write_text(
                json.dumps(
                    {
                        "pane": "owned",
                        "originalPane": "user",
                        "workspace": "workspace",
                        "serverBinding": hashlib.sha256(b"socket27").hexdigest(),
                    }
                )
            )
            server = json.dumps({"socket": "socket", "protocol": 27})
            inventory = json.dumps({"result": {"panes": [{"pane_id": "user"}]}})
            with (
                patch.object(
                    starter.subprocess, "check_output", side_effect=[server, inventory]
                ) as command,
                patch.object(starter.subprocess, "run") as close,
            ):
                assert starter.retire_owned_capture(root) == {
                    "pane": "owned",
                    "alreadyRetired": True,
                }
                assert command.call_args_list[-1].args[0] == [
                    "herdr",
                    "pane",
                    "list",
                    "--workspace",
                    "workspace",
                ]
                close.assert_not_called()
            inventory = json.dumps(
                {"result": {"panes": [{"pane_id": "owned"}, {"pane_id": "user"}]}}
            )
            with (
                patch.object(
                    starter.subprocess, "check_output", side_effect=[server, inventory]
                ),
                patch.object(starter.subprocess, "run") as close,
            ):
                assert starter.retire_owned_capture(root) == {
                    "pane": "owned",
                    "alreadyRetired": False,
                }
                assert close.call_args.args[0] == ["herdr", "pane", "close", "owned"]

    def test_model_argv_requires_the_complete_executed_arguments(self):
        campaign_spec = importlib.util.spec_from_file_location(
            "campaign_driver", MODULE.with_name("drive-salesforce-campaign.py")
        )
        assert campaign_spec is not None
        assert campaign_spec.loader is not None
        campaign = importlib.util.module_from_spec(campaign_spec)
        campaign_spec.loader.exec_module(campaign)
        argv = [
            "sf",
            "data",
            "query",
            "--query",
            "SELECT Id FROM Opportunity WHERE Name = '$HOME ; 北方'",
            "--target-org",
            "synthetic",
            "--json",
        ]
        tool = {
            "role": "toolResult",
            "toolName": "sf_query",
            "details": {"commandEvidence": {"commands": [argv], "withheld": 0}},
        }

        def reply(command):
            return {
                "role": "assistant",
                "content": [
                    {
                        "type": "text",
                        "text": "```json\n" + json.dumps(command) + "\n```",
                    }
                ],
            }

        assert campaign.audit_model_commands([tool, reply(argv)])[0]["passed"]
        assert not campaign.audit_model_commands([tool, reply([*argv[:-3], "--json"])])[
            0
        ]["passed"]
        assert not campaign.audit_model_commands([tool, reply([*argv, "--all-rows"])])[
            0
        ]["passed"]
        assert not campaign.audit_model_commands(
            [
                tool,
                {
                    "role": "assistant",
                    "content": [{"type": "text", "text": "Used sf_query successfully"}],
                },
            ]
        )[0]["passed"]
        assert not campaign.audit_model_commands(
            [tool, {"role": "user", "content": "Another turn"}, reply(argv)]
        )[0]["passed"]

    def test_model_argv_accepts_multiple_commands_in_one_turn(self):
        campaign_spec = importlib.util.spec_from_file_location(
            "campaign_driver", MODULE.with_name("drive-salesforce-campaign.py")
        )
        assert campaign_spec is not None
        assert campaign_spec.loader is not None
        campaign = importlib.util.module_from_spec(campaign_spec)
        campaign_spec.loader.exec_module(campaign)
        org = ["sf", "org", "display", "--json"]
        query = [
            "sf",
            "data",
            "query",
            "--query",
            "SELECT Id FROM Opportunity WHERE Id = null",
            "--json",
        ]
        tools = [
            {
                "role": "toolResult",
                "toolName": name,
                "details": {"commandEvidence": {"commands": [argv]}},
            }
            for name, argv in [("sf_org_display", org), ("sf_query", query)]
        ]
        reply = {
            "role": "assistant",
            "content": [
                {
                    "type": "text",
                    "text": "```json\n"
                    + json.dumps(org)
                    + "\n"
                    + json.dumps(query)
                    + "\n```",
                }
            ],
        }
        assert all(
            row["passed"] for row in campaign.audit_model_commands([*tools, reply])
        )
        assert not any(
            row["passed"]
            for row in campaign.audit_model_commands([*tools, {"role": "user"}, reply])
        )

    def test_campaign_startup_and_independent_operator_faults(self):
        campaign_spec = importlib.util.spec_from_file_location(
            "campaign_driver", MODULE.with_name("drive-salesforce-campaign.py")
        )
        assert campaign_spec is not None
        assert campaign_spec.loader is not None
        campaign = importlib.util.module_from_spec(campaign_spec)
        campaign_spec.loader.exec_module(campaign)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            with self.assertRaises(TimeoutError):
                campaign.wait_ready(root, "2.3.15", timeout=0.01)
            (root / "events.jsonl").write_text(
                json.dumps({"event": "ready", "hasUI": True, "pluginVersion": "2.3.15"})
                + "\n"
            )
            campaign.wait_ready(root, "2.3.15", timeout=0.02)
            with self.assertRaisesRegex(RuntimeError, "provenance"):
                campaign.wait_ready(root, "2.3.14", timeout=0.02)
        prompts = campaign.fixture_prompts(Path("/synthetic/plugin"), "cli-operator")
        assert len(prompts) == 4
        assert "Name = 'partial'" in prompts[-1]
        assert all("agents/cli-operator.md" in prompt for prompt in prompts)
        assert all(
            any(outcome in prompt for prompt in prompts)
            for outcome in ["empty", "partial", "failed"]
        )

    def test_scroll_capture_retains_compressed_evidence_and_rejects_missing_rows(self):
        surface_spec = importlib.util.spec_from_file_location(
            "surface_driver", MODULE.with_name("drive-salesforce-surface-capture.py")
        )
        assert surface_spec is not None
        assert surface_spec.loader is not None
        surface = importlib.util.module_from_spec(surface_spec)
        surface_spec.loader.exec_module(surface)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            (root / "frames").mkdir()
            frame = {
                "terminalColumns": 160,
                "viewport": {"rows": ["first", "second"], "offset": 0, "totalLines": 2},
            }
            path = root / "frames" / "page.json"
            payload = json.dumps(frame).encode()
            for observed, passed in [(b"first\nsecond\n", True), (b"first\n", False)]:
                path.write_bytes(payload)
                with (
                    patch.object(surface.time, "sleep"),
                    patch.object(
                        surface.subprocess, "check_output", return_value=observed
                    ),
                ):
                    result = surface.capture_page(root, "owned-pane", "page", 153)
                assert result["passed"] is passed
                assert not path.exists()
                assert (
                    gzip.decompress(path.with_suffix(".json.gz").read_bytes())
                    == payload
                )

    def test_scroll_geometry_requires_height_and_fresh_provenance(self):
        surface_spec = importlib.util.spec_from_file_location(
            "surface_readiness", MODULE.with_name("drive-salesforce-surface-capture.py")
        )
        assert surface_spec is not None
        assert surface_spec.loader is not None
        surface = importlib.util.module_from_spec(surface_spec)
        surface_spec.loader.exec_module(surface)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "frames").mkdir()
            ready = {
                "runtimeVersion": "23.9.3",
                "pluginVersion": "2.3.15",
                "binary": "/synthetic/xcsh",
                "terminalColumns": 157,
            }
            (root / "ready.json").write_text(json.dumps(ready))
            (root / "manifest.json").write_text(json.dumps(ready))
            with self.assertRaisesRegex(ValueError, "height"):
                surface.terminal_geometry(root, ready, None)
            assert surface.terminal_geometry(
                root, {**ready, "terminalRows": 49}, None
            ) == (157, 49)
            path = root / "frames/geometry.json"
            frame = {**ready, "terminalRows": 49}
            path.write_text(json.dumps(frame))
            assert surface.terminal_geometry(root, ready, "geometry.json") == (157, 49)
            for field in ["runtimeVersion", "pluginVersion", "binary"]:
                path.write_text(json.dumps({**frame, field: "wrong"}))
                with self.assertRaises(ValueError):
                    surface.terminal_geometry(root, ready, "geometry.json")
            for height in [None, 0, -1, True, "49"]:
                path.write_text(json.dumps({**frame, "terminalRows": height}))
                with self.assertRaisesRegex(ValueError, "height"):
                    surface.terminal_geometry(root, ready, "geometry.json")
            path.write_text(json.dumps(frame))
            os.utime(path, (1, 1))
            with self.assertRaises(ValueError):
                surface.terminal_geometry(root, ready, "geometry.json")

    def test_scroll_geometry_change_cannot_pass_as_stable_acceptance(self):
        surface_spec = importlib.util.spec_from_file_location(
            "surface_geometry", MODULE.with_name("drive-salesforce-surface-capture.py")
        )
        assert surface_spec is not None
        assert surface_spec.loader is not None
        surface = importlib.util.module_from_spec(surface_spec)
        surface_spec.loader.exec_module(surface)
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root / "frames").mkdir()
            frame = {
                "terminalColumns": 160,
                "terminalRows": 25,
                "viewport": {"rows": ["row"], "offset": 0, "totalLines": 1},
            }
            (root / "frames/page.json").write_text(json.dumps(frame))
            with (
                patch.object(surface.time, "sleep"),
                patch.object(surface.subprocess, "check_output", return_value=b"row\n"),
            ):
                result = surface.capture_page(
                    root, "owned-pane", "page", 153, (160, 51)
                )
            assert not result["passed"]
            assert result["geometryMatches"] is False

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

    def test_hyperlink_metadata_has_no_visible_width(self):
        for ending in ["\x07", "\x1b\\"]:
            link = "\x1b]8;;https://example.com/long-hidden-path" + ending
            close = "\x1b]8;;" + ending
            value = link + "\x1b[34mexample\x1b[0m" + close
            assert driver.plain(value) == "example"
            assert driver.columns(value) == 7
            assert driver.columns(value + " too wide") == 16

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
