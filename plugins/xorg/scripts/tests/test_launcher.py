# ruff: noqa: ANN201, D101, D102, PT009, PT027
import json
import pathlib
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import launcher as launcher_module  # noqa: E402
from xorgctl_lib.common import VERSION  # noqa: E402


class LauncherTests(unittest.TestCase):
    def test_launcher_survives_removal_of_plugin_cache(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            cache = root / "cache with spaces"
            shutil.copytree(SCRIPTS, cache / "scripts")
            shutil.copytree(SCRIPTS.parent / ".xcsh-plugin", cache / ".xcsh-plugin")
            home = root / "home"
            home.mkdir()
            with (
                patch.object(launcher_module.pathlib.Path, "home", return_value=home),
                patch.object(
                    launcher_module,
                    "__file__",
                    str(cache / "scripts/xorgctl_lib/launcher.py"),
                ),
            ):
                launcher_module.install(pathlib.Path(sys.executable))
            launcher = home / ".local/bin/xorgctl"
            shutil.rmtree(cache)
            result = subprocess.run(  # noqa: S603 -- temporary, task-owned controller fixture
                [str(launcher), "--version"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), VERSION)
            self.assertNotIn(str(cache), launcher.read_text())

    def test_failed_payload_stage_preserves_previous_launcher(self):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            launcher = home / ".local/bin/xorgctl"
            launcher.parent.mkdir(parents=True)
            launcher.write_text("previous launcher")
            with (
                patch.object(launcher_module.pathlib.Path, "home", return_value=home),
                patch.object(
                    launcher_module.shutil,
                    "copytree",
                    side_effect=OSError("stage failed"),
                ),
                self.assertRaisesRegex(OSError, "stage failed"),
            ):
                launcher_module.install(pathlib.Path(sys.executable))
            self.assertEqual(launcher.read_text(), "previous launcher")

    def test_launcher_preserves_interpreter_and_argv_on_repeat_install(self):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory) / "home with 'quotes'"
            home.mkdir()
            log = home / "argv.json"
            interpreter = home / "managed python 'exact'"
            interpreter.write_text(
                f"#!{sys.executable}\nimport json, os, sys\n"
                f"open({str(log)!r}, 'w').write(json.dumps(sys.argv[1:]))\n"
                f"os.execv({sys.executable!r}, [{sys.executable!r}, *sys.argv[1:]])\n"
            )
            interpreter.chmod(0o755)
            with patch.object(launcher_module.pathlib.Path, "home", return_value=home):
                launcher_module.install(interpreter)
                launcher = home / ".local/bin/xorgctl"
                previous = launcher.stat().st_ino
                launcher_module.install(interpreter)
                self.assertEqual(launcher.stat().st_ino, previous)
            arguments = ["--version", "", "a b", "quote'\"", "$HOME; $(false)", "雪"]
            result = subprocess.run(  # noqa: S603 -- temporary, task-owned controller fixture
                [str(launcher), *arguments],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            received = json.loads(log.read_text())
            self.assertEqual(received[1:], arguments)
            self.assertTrue(pathlib.Path(received[0]).is_file())
            self.assertEqual(launcher.stat().st_mode & 0o777, 0o755)
            runtime = home / ".local/share/xorgctl/runtime"
            self.assertEqual(len(list(runtime.iterdir())), 1)
            self.assertEqual(runtime.stat().st_mode & 0o777, 0o700)

    def test_failed_activation_keeps_previous_controller_executable(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            home = root / "home"
            cache = root / "cache"
            shutil.copytree(SCRIPTS, cache / "scripts")
            shutil.copytree(SCRIPTS.parent / ".xcsh-plugin", cache / ".xcsh-plugin")
            with patch.object(launcher_module.pathlib.Path, "home", return_value=home):
                launcher_module.install(pathlib.Path(sys.executable))
                launcher = home / ".local/bin/xorgctl"
                previous = launcher.read_text()
                with (cache / "scripts/xorgctl").open("a") as stream:
                    stream.write("\n# replacement fixture\n")
                with (
                    patch.object(
                        launcher_module,
                        "__file__",
                        str(cache / "scripts/xorgctl_lib/launcher.py"),
                    ),
                    patch.object(
                        launcher_module.pathlib.Path,
                        "replace",
                        side_effect=OSError("activation failed"),
                    ),
                    self.assertRaisesRegex(OSError, "activation failed"),
                ):
                    launcher_module.install(pathlib.Path(sys.executable))
                self.assertEqual(launcher.read_text(), previous)
                self.assertEqual(list(launcher.parent.iterdir()), [launcher])
            shutil.rmtree(cache)
            result = subprocess.run(  # noqa: S603 -- temporary, task-owned controller fixture
                [str(launcher), "--version"],
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertEqual(result.stdout.strip(), VERSION)
