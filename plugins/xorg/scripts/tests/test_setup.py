import pathlib
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import setup  # noqa: E402
from xorgctl_lib.common import VERSION  # noqa: E402


class SetupTests(unittest.TestCase):
    def test_apply_restarts_every_active_configured_session_worker(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "state"
            home = pathlib.Path(directory) / "home"
            for name in ("console", "desktop", "paused"):
                session = root / name
                session.mkdir(parents=True)
                (session / "session.json").write_text("{}")

            commands = []

            def command(argv, **_kwargs):
                commands.append(argv)
                return subprocess.CompletedProcess(argv, 0, "", "")

            def service_active(name):
                return name in {
                    "xorgctl-session@console.service",
                    "xorgctl-session@desktop.service",
                    "xcsh-camera.service",
                }

            with (
                patch.object(setup, "ROOT", root),
                patch.object(setup.pathlib.Path, "home", return_value=home),
                patch.object(
                    setup,
                    "_platform",
                    return_value={"id": "ubuntu", "version_id": "24.04"},
                ),
                patch.object(setup, "_command", side_effect=command),
                patch.object(setup, "_service_active", side_effect=service_active),
                patch.object(setup, "_worker_version", return_value=VERSION),
                patch.object(setup, "_install_launcher"),
                patch.object(setup, "_install_session_service"),
                patch.object(setup, "status", return_value={"state": "ready"}),
            ):
                setup.apply(VERSION)

            restarts = [
                argv[-1]
                for argv in commands
                if argv[:3] == ["systemctl", "--user", "restart"]
            ]
            self.assertEqual(
                restarts,
                [
                    "xorgctl-session@console.service",
                    "xorgctl-session@desktop.service",
                ],
            )

    def test_session_worker_checks_include_each_active_configured_session(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            for name in ("console", "desktop", "paused"):
                session = root / name
                session.mkdir(parents=True)
                (session / "session.json").write_text("{}")

            def service_active(name):
                return name in {
                    "xorgctl-session@console.service",
                    "xorgctl-session@desktop.service",
                }

            def worker_version(name):
                return VERSION if name == "console" else "1.0.3"

            with (
                patch.object(setup, "ROOT", root),
                patch.object(setup, "_service_active", side_effect=service_active),
                patch.object(setup, "_worker_version", side_effect=worker_version),
            ):
                self.assertEqual(
                    setup.session_worker_checks(),
                    {
                        "console": {"ready": True, "version": VERSION},
                        "desktop": {"ready": False, "version": "1.0.3"},
                    },
                )


if __name__ == "__main__":
    unittest.main()
