import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[2]


class StatusPresentationTests(unittest.TestCase):
    def execute(
        self, operation, fixture, shell="bash", curl_exit=0, raw=None, responses=None
    ):
        text = (ROOT / "skills/monitor/references/commands.md").read_text()
        command = re.search(
            r"## " + operation + r"\n.*?```bash\n(.*?)```", text, re.S
        ).group(1)
        with tempfile.TemporaryDirectory() as directory:
            curl = Path(directory) / "curl"
            curl.write_text(
                "#!/usr/bin/env python3\nimport sys\nprint("
                + repr(json.dumps(fixture) if raw is None else raw)
                + ")\nsys.exit("
                + str(curl_exit)
                + ")\n"
            )
            if responses is not None:
                curl.write_text(
                    "#!/usr/bin/env python3\nimport json, pathlib, sys\n"
                    + "state=pathlib.Path("
                    + repr(str(Path(directory) / "calls"))
                    + ")\n"
                    + "index=int(state.read_text()) if state.exists() else 0\n"
                    + "state.write_text(str(index+1))\n"
                    + "responses="
                    + repr(responses)
                    + "\n"
                    + "payload,status=responses[index]\nprint(payload)\nsys.exit(status)\n"
                )
            curl.chmod(0o700)
            environment = os.environ.copy()
            environment["PATH"] = directory + os.pathsep + environment["PATH"]
            result = subprocess.run(
                [shell, "-c", command], env=environment, capture_output=True, text=True
            )
        if curl_exit or raw is not None or responses is not None:
            self.assertNotEqual(result.returncode, 0)
            return result
        self.assertEqual(result.returncode, 0, result.stderr)
        return json.loads(result.stdout)

    def test_collection_time_is_not_page_update_time(self):
        fixture = {
            "page": {"name": "Synthetic", "updated_at": "2001-01-01T00:00:00Z"},
            "status": {"indicator": "none", "description": ""},
        }
        result = self.execute("overall-status", fixture)
        self.assertNotEqual(result["observed_at"], fixture["page"]["updated_at"])
        self.assertEqual(result["page_updated_at"], fixture["page"]["updated_at"])
        self.assertEqual(result["description"], "")
        self.assertTrue(result["source_url"].endswith("/api/v2/status.json"))

    def test_briefing_retains_every_incident_update(self):
        updates = [
            {"body": "LATEST", "status": "investigating"},
            {"body": "EARLIER_LITERAL_GUIDANCE", "status": "identified"},
        ]
        fixture = {
            "page": {"name": "Synthetic", "updated_at": None},
            "status": {},
            "components": [
                {
                    "id": "c1",
                    "name": "Synthetic component",
                    "status": "operational",
                    "group": False,
                }
            ],
            "incidents": [
                {"name": "Incident", "incident_updates": updates, "components": []}
            ],
            "scheduled_maintenances": [],
        }
        result = self.execute("full-briefing", fixture)
        self.assertIsNone(result["page_updated_at"])
        self.assertEqual(result["active_incidents"][0]["updates"], updates)
        self.assertEqual(json.dumps(result).count("LATEST"), 1)
        self.assertEqual(
            result["component_health"][0]["components"][0]["name"],
            "Synthetic component",
        )
        self.assertEqual(result["component_health"][0]["operational"], 1)
        self.assertEqual(result["component_health"][0]["affected_count"], 0)

    def test_incident_operations_preserve_complete_evidence_once(self):
        updates = [
            {"body": "LATEST_LITERAL_GUIDANCE", "created_at": "2001-01-01"},
            {"body": "", "status": None},
        ]
        fixture = {
            "incidents": [
                {"name": "Synthetic", "incident_updates": updates, "components": []}
            ]
        }
        for operation in ("active-incidents", "recent-incidents"):
            with self.subTest(operation=operation):
                result = self.execute(operation, fixture)
                self.assertEqual(result[0]["updates"], updates)
                self.assertEqual(json.dumps(result).count("LATEST_LITERAL_GUIDANCE"), 1)

    def test_component_summary_retains_operational_identity(self):
        fixture = {
            "components": [
                {
                    "id": "c1",
                    "name": "Synthetic",
                    "status": "operational",
                    "group": False,
                }
            ]
        }
        result = self.execute("list-components", fixture)
        self.assertEqual(result[0]["components"][0]["name"], "Synthetic")
        self.assertEqual(result[0]["operational"], 1)
        self.assertEqual(result[0]["affected_count"], 0)

    def test_failed_and_malformed_status_do_not_report_success(self):
        self.execute("overall-status", {}, curl_exit=22)
        self.execute("overall-status", {}, raw="not-json")

    def test_multi_source_failure_keeps_partial_output_and_failure_status(self):
        for operation, empty, count in (
            ("maintenance", {"scheduled_maintenances": []}, 2),
            (
                "search",
                {"components": [], "incidents": [], "scheduled_maintenances": []},
                3,
            ),
        ):
            with self.subTest(operation=operation):
                responses = [("", 22)] + [(json.dumps(empty), 0)] * (count - 1)
                result = self.execute(operation, {}, responses=responses)
                self.assertIn("[]", result.stdout)

    def test_dataset_guard_checks_plugin_sources_separately_from_dependencies(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            dependency = root / "node_modules" / "synthetic"
            dependency.mkdir(parents=True)
            (dependency / "address.json").write_text('{"total_metros": 30}')
            command = 'source "$1"; test_no_runtime_topology_or_address_dataset'
            env = {**os.environ, "PLUGIN_ROOT": directory}
            args = [
                "bash",
                "-c",
                command,
                "fixture",
                str(ROOT / "scripts/tests/test_structure.sh"),
            ]
            result = subprocess.run(args, env=env, capture_output=True, text=True)
            self.assertEqual(result.returncode, 0, result.stdout)
            (root / "source.py").write_text("total_metros = 30")
            result = subprocess.run(args, env=env, capture_output=True, text=True)
            self.assertNotEqual(result.returncode, 0)

    def test_commands_execute_in_bash_and_zsh(self):
        fixture = {
            "page": {"name": "Synthetic", "updated_at": None},
            "status": {"indicator": "none", "description": ""},
        }
        for shell in ("bash", "zsh"):
            with self.subTest(shell=shell):
                result = self.execute("overall-status", fixture, shell=shell)
                self.assertEqual(result["description"], "")
                self.assertIsNone(result["page_updated_at"])


if __name__ == "__main__":
    unittest.main()
