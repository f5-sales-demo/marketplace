# ruff: noqa: INP001, PT009
"""Exercise the shipped read-only collector against local HTTP fixtures."""

import json
import os
import re
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

SCRIPT = Path(__file__).resolve().parents[1] / "firecrawl-status.py"
PLUGIN = SCRIPT.parents[1]
HTTP_FOUND = 302


class StatusTests(unittest.TestCase):
    """Qualify the shipped identity collector without a real Firecrawl service."""

    def collect(
        self, root: Any, health: Any, check: bool = False
    ) -> tuple[subprocess.CompletedProcess[str], Any]:
        """Execute a real collector against a local deterministic HTTP endpoint."""

        class Handler(BaseHTTPRequestHandler):
            def do_GET(self) -> None:
                status, value = health if self.path.endswith("v1/health") else root
                self.send_response(status)
                if status == HTTP_FOUND:
                    self.send_header("Location", "/redirect-target")
                self.end_headers()
                if value == b"slow_fixture":
                    time.sleep(6)
                    return
                self.wfile.write(
                    value if isinstance(value, bytes) else json.dumps(value).encode()
                )

            def log_message(self, *_args: Any) -> None:
                pass

        server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            env = {
                **os.environ,
                "FIRECRAWL_API_URL": f"http://127.0.0.1:{server.server_port}/nested/",
            }
            result = subprocess.run(  # noqa: S603 - fixed collector and local fixture arguments
                [sys.executable, str(SCRIPT), *(["--check"] if check else [])],
                env=env,
                capture_output=True,
                text=True,
                timeout=15,
                check=False,
            )
            return result, json.loads(result.stdout)
        finally:
            server.shutdown()
            server.server_close()
            thread.join()

    def test_complete_status_preserves_literal_values_and_evidence_once(self) -> None:
        """Complete status preserves literal values and evidence once."""
        identity = {
            "message": "Firecrawl API",
            "documentation_url": "https://docs.firecrawl.dev",
        }
        health = {
            "version": "",
            "jobs": 0,
            "success": False,
            "guidance": "restart only with approval",
            "long": "x" * 4000,
        }
        result, data = self.collect((200, identity), (200, health))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(data["state"], "ready")
        self.assertEqual(data["version"], "")
        self.assertEqual(data["evidence"]["health"]["body"], health)
        self.assertEqual(result.stdout.count("restart only with approval"), 1)
        self.assertIn("/nested/", data["endpoint"])

    def test_other_service_is_not_ready(self) -> None:
        """Other service is not ready."""
        result, data = self.collect((200, {"message": "other"}), (200, {}), check=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(data["state"], "invalid_response")

    def test_malformed_root_is_not_ready(self) -> None:
        """Malformed root is not ready."""
        result, data = self.collect((200, b"{bad"), (200, {}), check=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(data["state"], "invalid_response")

    def test_unknown_version_does_not_mask_failed_health(self) -> None:
        """Unknown version does not mask failed health."""
        identity = {
            "message": "Firecrawl API",
            "documentation_url": "https://docs.firecrawl.dev",
        }
        result, data = self.collect(
            (200, identity), (503, {"error": "backend unavailable"})
        )
        self.assertEqual(result.returncode, 0)
        self.assertEqual(data["version"], "unknown")
        self.assertEqual(data["healthState"], "failed")
        self.assertEqual(data["evidence"]["health"]["httpStatus"], 503)
        self.assertIn("backend", data["warnings"][0].lower())

    def test_redacts_nested_credentials_without_losing_zero_false_or_empty(
        self,
    ) -> None:
        """Redacts nested credentials without losing zero false or empty."""
        identity = {
            "message": "Firecrawl API",
            "documentation_url": "https://docs.firecrawl.dev",
        }
        health = {
            "version": 0,
            "nested": {"api_key": "private", "enabled": False, "note": ""},
        }
        _, data = self.collect((200, identity), (200, health))
        self.assertEqual(data["version"], 0)
        self.assertEqual(
            data["evidence"]["health"]["body"]["nested"],
            {"api_key": "[REDACTED]", "enabled": False, "note": ""},
        )

    def test_invalid_configuration_does_not_echo_credentials(self) -> None:
        """Invalid configuration does not echo credentials."""
        result = subprocess.run(  # noqa: S603 - fixed collector and local fixture arguments
            [sys.executable, str(SCRIPT)],
            env={
                **os.environ,
                "FIRECRAWL_API_URL": "http://user:private@127.0.0.1/?token=private",
            },
            capture_output=True,
            text=True,
            timeout=5,
            check=False,
        )
        self.assertNotEqual(result.returncode, 0)
        self.assertNotIn("private", result.stdout + result.stderr)
        self.assertEqual(json.loads(result.stdout)["state"], "invalid_configuration")

    def test_redirect_oversized_and_deep_json_fail_with_complete_diagnostics(
        self,
    ) -> None:
        """Invalid bodies produce bounded structured failures rather than tracebacks."""
        for response, reason in (
            ((302, {}), "http_status"),
            ((200, b"x" * (1024 * 1024 + 1)), "response_too_large"),
            ((200, b"[" * 2000 + b"0" + b"]" * 2000), "malformed_json"),
        ):
            with self.subTest(reason=reason):
                result, data = self.collect(response, (200, {}))
                self.assertNotEqual(result.returncode, 0)
                self.assertEqual(data["state"], "invalid_response")
                self.assertNotIn("Traceback", result.stderr)

    def test_slow_response_is_unavailable_with_bounded_json(self) -> None:
        """A stalled response ends within the request budget with structured evidence."""
        started = time.monotonic()
        result, data = self.collect((200, b"slow_fixture"), (200, {}))
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual(data["state"], "unavailable")
        self.assertLess(time.monotonic() - started, 8)

    def test_nonobject_health_is_invalid_and_visible(self) -> None:
        """A JSON scalar does not establish health readiness."""
        identity = {
            "message": "Firecrawl API",
            "documentation_url": "https://docs.firecrawl.dev",
        }
        _, data = self.collect((200, identity), (200, False))
        self.assertEqual(data["healthState"], "invalid_response")
        self.assertTrue(data["warnings"])
        self.assertIs(data["evidence"]["health"]["body"], False)

    def test_shipped_operator_fences_compile_and_polling_exhaustion_fails(self) -> None:
        """Execute guidance using harmless shell functions, including exhausted polls."""
        text = (PLUGIN / "agents/firecrawl-operator.md").read_text()
        fences = re.findall(r"```bash\n(.*?)\n```", text, re.DOTALL)
        self.assertGreater(len(fences), 10)
        for shell in ("bash", "zsh"):
            for fence in fences:
                parsed = subprocess.run(  # noqa: S603 - fixed shells, guidance via stdin
                    [shell, "-n"],
                    input=fence,
                    text=True,
                    capture_output=True,
                    check=False,
                )
                self.assertEqual(parsed.returncode, 0, parsed.stderr)
            for fence in (value for value in fences if "for i in" in value):
                for status in ("completed", "failed", "scraping"):
                    prelude = (
                        "curl() { printf '%s\\n' \"$FIXTURE_RESPONSE\"; }\n"
                        "sleep() { :; }\n"
                    )
                    result = subprocess.run(  # noqa: S603 - fixed shell, harmless function fixtures
                        [shell],
                        input=prelude + fence,
                        text=True,
                        capture_output=True,
                        env={
                            **os.environ,
                            "FIXTURE_RESPONSE": json.dumps({"status": status}),
                        },
                        timeout=10,
                        check=False,
                    )
                    self.assertEqual(
                        result.returncode == 0, status == "completed", result.stderr
                    )
                    if status == "scraping":
                        self.assertIn("INCOMPLETE", result.stdout)

    def test_status_and_hook_execute_under_bash_and_zsh_with_spaced_plugin_root(
        self,
    ) -> None:
        """Shipped shell invocation preserves exact paths and startup guidance."""
        status = re.search(
            r"```bash\n(.*?)\n```",
            (PLUGIN / "commands/firecrawl-status.md").read_text(),
            re.DOTALL,
        ).group(1)
        hook = json.loads((PLUGIN / "hooks/hooks.json").read_text())["hooks"][
            "SessionStart"
        ][0]["hooks"][0]["command"]
        with tempfile.TemporaryDirectory(prefix="firecrawl fixture ") as directory:
            root = Path(directory) / "plugin root"
            root.symlink_to(PLUGIN, target_is_directory=True)
            for shell in ("bash", "zsh"):
                for command in (status, hook):
                    result = subprocess.run(  # noqa: S603 - fixed shell and shipped local collector
                        [shell],
                        input=command,
                        text=True,
                        capture_output=True,
                        env={
                            **os.environ,
                            "XCSH_PLUGIN_ROOT": str(root),
                            "FIRECRAWL_API_URL": "invalid",
                        },
                        timeout=5,
                        check=False,
                    )
                    if command == hook:
                        self.assertEqual(result.returncode, 0)
                        self.assertIn("WARNING: Firecrawl API identity", result.stdout)
                    else:
                        self.assertNotEqual(result.returncode, 0)
                        self.assertEqual(
                            json.loads(result.stdout)["state"], "invalid_configuration"
                        )


if __name__ == "__main__":
    unittest.main()
