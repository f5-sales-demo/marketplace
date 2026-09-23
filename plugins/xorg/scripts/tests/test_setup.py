# ruff: noqa: ANN001, ANN003, ANN201, ANN202, D101, D102, PT009, PT027, SLF001, TC006
# pylint: disable=protected-access
import pathlib
import subprocess
import sys
import tempfile
import unittest
from typing import Any, cast
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import sessions, setup  # noqa: E402
from xorgctl_lib.common import VERSION  # noqa: E402


class SetupTests(unittest.TestCase):
    def test_package_install_refreshes_indexes_then_installs_noninteractively(self):
        calls = []

        def command(argv, **kwargs):
            calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, "", "")

        with patch.object(setup, "_command", side_effect=command):
            setup._install_packages()

        self.assertEqual(calls[0][0][-2:], ["apt-get", "update"])
        self.assertEqual(
            calls[1][0][:5],
            ["sudo", "-n", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get"],
        )
        self.assertEqual(calls[1][0][5], "install")

    def test_python_install_uses_ubuntu_interpreter_when_invoked_by_anaconda(self):
        calls = []

        def command(argv, **kwargs):
            calls.append((argv, kwargs))
            return subprocess.CompletedProcess(argv, 0, "", "")

        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            with (
                patch.object(setup.pathlib.Path, "home", return_value=home),
                patch.dict(
                    setup.os.environ,
                    {"PATH": "/opt/anaconda/bin:/usr/bin"},
                ),
                patch.object(setup, "_command", side_effect=command),
            ):
                interpreter = setup._install_python()

        self.assertEqual(calls[0][0][0], "/usr/bin/python3")
        self.assertEqual(calls[0][0][1:3], ["-m", "venv"])
        self.assertEqual(interpreter, home / ".local/share/xorgctl/venv/bin/python")

    def test_session_worker_uses_managed_interpreter_after_setup(self):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            managed = home / ".local/share/xorgctl/venv/bin/python"
            managed.parent.mkdir(parents=True)
            managed.touch()
            with (
                patch.object(sessions.pathlib.Path, "home", return_value=home),
                patch.object(sessions.sys, "executable", "/opt/anaconda/bin/python3"),
            ):
                self.assertEqual(sessions._worker_interpreter(), str(managed))

    def test_font_install_is_idempotent_when_pinned_font_is_ready(self):
        with (
            patch.object(
                setup,
                "_font_status",
                return_value={"ready": True, "version": setup.NERD_FONTS_VERSION},
            ),
            patch.object(setup, "_download_verified") as download,
        ):
            setup._install_fonts()
        download.assert_not_called()

    def test_audio_status_requires_live_named_virtual_endpoints(self):
        devices = {
            "sinks": [{"name": "xorgctl_console", "description": "xcsh_Inbound_Audio"}],
            "sources": [
                {"name": "xcsh_microphone_input", "description": "xcsh Microphone"}
            ],
        }
        config = {
            "audio_sink": "xorgctl_console",
            "audio_source": "xcsh_microphone_input",
            "virtual_audio": True,
        }
        with (
            patch.object(setup, "_session_config", return_value=config),
            patch.object(setup, "rpc", return_value=devices),
        ):
            result = setup._audio_status()
        self.assertTrue(result["ready"])
        self.assertFalse(result["physical_fallback"])
        self.assertEqual(result["sink_description"], "xcsh_Inbound_Audio")

    def test_audio_status_rejects_stale_config_without_live_devices(self):
        config = {
            "audio_sink": "xorgctl_console",
            "audio_source": "xcsh_microphone_input",
            "virtual_audio": True,
        }
        with (
            patch.object(setup, "_session_config", return_value=config),
            patch.object(setup, "rpc", return_value={"sinks": [], "sources": []}),
        ):
            self.assertFalse(setup._audio_status()["ready"])

    def test_audio_status_reports_physical_device_fallback(self):
        config = {
            "audio_sink": "alsa_output.pci-0000_00_1f.3.analog-stereo",
            "audio_source": "alsa_input.usb-camera",
            "virtual_audio": True,
        }
        with (
            patch.object(setup, "_session_config", return_value=config),
            patch.object(setup, "rpc", return_value={"sinks": [], "sources": []}),
        ):
            result = setup._audio_status()
        self.assertFalse(result["ready"])
        self.assertTrue(result["physical_fallback"])

    def test_installed_virtualgl_must_match_the_pinned_package_version(self):
        completed = subprocess.CompletedProcess(
            ["dpkg-query"], 0, setup.VIRTUALGL_VERSION + "\n", ""
        )
        with (
            patch.object(setup.shutil, "which", return_value="/usr/bin/nvidia-smi"),
            patch.object(setup, "_command", return_value=completed),
        ):
            self.assertEqual(
                setup._virtualgl_status(),
                {"required": True, "ready": True, "version": setup.VIRTUALGL_VERSION},
            )

    def test_nvidia_tools_without_an_accessible_gpu_do_not_make_gpu_mandatory(self):
        def command(argv, **_kwargs):
            return subprocess.CompletedProcess(argv, 1, "", "no devices")

        with (
            patch.object(setup.shutil, "which", return_value="/usr/bin/nvidia-smi"),
            patch.object(setup, "_command", side_effect=command),
        ):
            self.assertEqual(
                setup._gpu_status(),
                {
                    "detected": False,
                    "required": False,
                    "ready": True,
                    "renderer": "native",
                },
            )

    def test_accessibility_is_configured_without_a_desktop_shell(self):
        with patch.object(
            setup,
            "_command",
            return_value=subprocess.CompletedProcess([], 0, "", ""),
        ) as command:
            setup._configure_accessibility()
        command.assert_called_once_with(
            [
                "gsettings",
                "set",
                "org.gnome.desktop.interface",
                "toolkit-accessibility",
                "true",
            ],
            check=True,
        )

    def test_service_install_preserves_unrelated_masked_user_unit(self):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory) / "home"
            systemd = home / ".config/systemd/user"
            systemd.mkdir(parents=True)
            unrelated = systemd / "snap.example.unrelated.service"
            unrelated.symlink_to("/dev/null")
            original_chmod = pathlib.Path.chmod

            def reject_unrelated_chmod(path, mode):
                if path == unrelated:
                    message = "unrelated masked service"
                    raise PermissionError(message)
                return original_chmod(path, mode)

            with (
                patch.object(setup.pathlib.Path, "home", return_value=home),
                patch.object(setup.pathlib.Path, "chmod", reject_unrelated_chmod),
                patch.object(setup, "_install_root_file"),
                patch.object(
                    setup,
                    "_command",
                    return_value=subprocess.CompletedProcess([], 0, "", ""),
                ),
            ):
                setup._install_services()

            self.assertTrue(unrelated.is_symlink())
            self.assertEqual(unrelated.readlink(), pathlib.Path("/dev/null"))

    def test_voice_install_is_idempotent_when_pinned_assets_are_ready(self):
        with (
            patch.object(setup, "_speech_status", return_value={"ready": True}),
            patch.object(setup, "_download_verified") as download,
        ):
            setup._install_voice()
        download.assert_not_called()

    def test_apply_skips_privileged_package_install_when_dependencies_are_ready(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "state"
            home = pathlib.Path(directory) / "home"
            managed_python = home / "venv/bin/python"
            managed_python.parent.mkdir(parents=True)
            managed_python.touch()
            (root / "console").mkdir(parents=True)
            (root / "console/session.json").write_text("{}")
            dependencies = {"commands": {}, "python_modules": {}, "ready": True}
            with (
                patch.object(setup, "ROOT", root),
                patch.object(setup.pathlib.Path, "home", return_value=home),
                patch.object(
                    setup,
                    "_platform",
                    return_value={"id": "ubuntu", "version_id": "24.04"},
                ),
                patch.object(setup, "_dependency_checks", return_value=dependencies),
                patch.object(setup, "_install_packages") as install_packages,
                patch.object(setup, "_install_python") as install_python,
                patch.object(setup, "_venv_python", return_value=managed_python),
                patch.object(setup, "_install_fonts"),
                patch.object(setup, "_install_voice"),
                patch.object(setup, "_install_virtualgl"),
                patch.object(setup, "_configure_accessibility"),
                patch.object(setup, "_install_launcher"),
                patch.object(setup, "_install_services"),
                patch.object(setup, "_service_active", return_value=True),
                patch.object(
                    setup,
                    "_command",
                    return_value=subprocess.CompletedProcess([], 0, "", ""),
                ),
                patch.object(setup, "_worker_version", return_value=VERSION),
                patch.object(setup, "_ensure_virtual_media"),
                patch.object(setup, "status", return_value={"state": "ready"}),
            ):
                setup.apply(VERSION)
        install_packages.assert_not_called()
        install_python.assert_not_called()

    def test_dependency_checks_use_the_managed_venv_for_python_modules(self):
        completed = subprocess.CompletedProcess(
            ["python"],
            0,
            '{"PIL": true, "PyQt6": true}',
            "",
        )
        with (
            patch.object(setup.pathlib.Path, "is_file", return_value=True),
            patch.object(setup.shutil, "which", return_value="/usr/bin/tool"),
            patch.object(setup, "_command", return_value=completed) as command,
        ):
            result = cast(dict[str, Any], setup._dependency_checks())
        self.assertEqual(command.call_args.args[0][0], str(setup._venv_python()))
        self.assertIn("PIL", result["python_modules"])

    def test_headless_host_creates_owned_console_instead_of_attaching(self):
        with patch.object(setup.pathlib.Path, "is_file", return_value=False):
            self.assertEqual(
                setup._console_plan(),
                ("create", {"geometry": "1920x1080"}, "headless_xvfb"),
            )

    def test_accessible_console_is_reused(self):
        completed = subprocess.CompletedProcess(["xdpyinfo"], 0, "", "")
        with (
            patch.object(setup.pathlib.Path, "is_file", return_value=True),
            patch.object(setup, "_command", return_value=completed),
        ):
            action, params, mode = setup._console_plan()
        self.assertEqual(action, "attach")
        self.assertEqual(params["display"], ":0")
        self.assertEqual(mode, "attached_xorg")

    def test_inaccessible_console_falls_back_to_owned_xvfb(self):
        completed = subprocess.CompletedProcess(["xdpyinfo"], 1, "", "denied")
        with (
            patch.object(setup.pathlib.Path, "is_file", return_value=True),
            patch.object(setup, "_command", return_value=completed),
        ):
            self.assertEqual(
                setup._console_plan(),
                ("create", {"geometry": "1920x1080"}, "headless_xvfb"),
            )

    def test_command_failure_is_normalized_without_environment_details(self):
        with (
            patch.object(
                setup.subprocess,
                "run",
                side_effect=FileNotFoundError("secret/path/tool"),
            ),
            self.assertRaisesRegex(setup.Fault, "command not found: missing-tool"),
        ):
            setup._command(["missing-tool"], check=True)

    def test_status_exposes_dependency_service_device_session_and_gpu_results(self):
        session = {
            "owned": True,
            "audio_sink": "xorgctl_console",
            "audio_source": "xcsh_microphone_input",
        }
        with (
            patch.object(
                setup, "_platform", return_value={"id": "ubuntu", "version_id": "24.04"}
            ),
            patch.object(
                setup,
                "_dependency_checks",
                return_value={"commands": {}, "python_modules": {}, "ready": True},
            ),
            patch.object(
                setup,
                "_font_status",
                return_value={"ready": True, "version": setup.NERD_FONTS_VERSION},
            ),
            patch.object(
                setup,
                "_camera_status",
                return_value={
                    "ready": True,
                    "device": "/dev/video10",
                    "label": "xcsh Camera",
                },
            ),
            patch.object(
                setup,
                "_audio_status",
                return_value={
                    "ready": True,
                    "sink": "xorgctl_console",
                    "source": "xcsh Microphone",
                },
            ),
            patch.object(
                setup,
                "_gpu_status",
                return_value={
                    "detected": False,
                    "required": False,
                    "ready": True,
                    "renderer": "native",
                },
            ),
            patch.object(
                setup,
                "_accessibility_status",
                return_value={"ready": True, "toolkit_accessibility": True},
            ),
            patch.object(
                setup,
                "_speech_status",
                return_value={"ready": True, "version": "1.8.0"},
            ),
            patch.object(setup, "_service_active", return_value=True),
            patch.object(setup, "_worker_version", return_value=VERSION),
            patch.object(setup, "_session_config", return_value=session),
            patch.object(
                setup,
                "session_worker_checks",
                return_value={"console": {"ready": True, "version": VERSION}},
            ) as worker_checks,
        ):
            result = cast(dict[str, Any], setup.status(VERSION))
            worker_checks.return_value = {
                "console": {"ready": True, "version": VERSION},
                "desktop": {"ready": False, "version": "1.0.5"},
            }
            stale_result = cast(dict[str, Any], setup.status(VERSION))
        self.assertEqual(result["state"], "ready")
        self.assertEqual(result["session_mode"], "headless_xvfb")
        self.assertTrue(result["dependencies"]["ready"])
        self.assertTrue(result["virtual_devices"]["audio"]["ready"])
        self.assertFalse(result["gpu_renderer"]["required"])
        self.assertTrue(result["services"]["pipewire"])
        self.assertTrue(result["services"]["pipewire_pulse"])
        self.assertTrue(result["services"]["wireplumber"])
        self.assertEqual(stale_result["state"], "degraded")
        self.assertIn("worker_version:desktop", stale_result["missing"])

    def test_apply_provisions_all_dependencies_before_creating_headless_console(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory) / "state"
            home = pathlib.Path(directory) / "home"
            calls: list[object] = []
            with (
                patch.object(setup, "ROOT", root),
                patch.object(setup.pathlib.Path, "home", return_value=home),
                patch.object(
                    setup,
                    "_platform",
                    return_value={"id": "ubuntu", "version_id": "24.04"},
                ),
                patch.object(
                    setup,
                    "_install_packages",
                    side_effect=lambda: calls.append("packages"),
                ),
                patch.object(
                    setup,
                    "_dependency_checks",
                    return_value={
                        "commands": {"Xvfb": False},
                        "python_modules": {"PIL": False},
                        "ready": False,
                    },
                ),
                patch.object(
                    setup, "_install_python", return_value=home / "venv/bin/python"
                ),
                patch.object(
                    setup, "_install_fonts", side_effect=lambda: calls.append("fonts")
                ),
                patch.object(
                    setup, "_install_voice", side_effect=lambda: calls.append("voice")
                ),
                patch.object(
                    setup,
                    "_install_virtualgl",
                    side_effect=lambda: calls.append("virtualgl"),
                ),
                patch.object(
                    setup,
                    "_configure_accessibility",
                    side_effect=lambda: calls.append("accessibility"),
                ),
                patch.object(setup, "_install_launcher"),
                patch.object(
                    setup,
                    "_install_services",
                    side_effect=lambda: calls.append("services"),
                ),
                patch.object(
                    setup,
                    "_console_plan",
                    return_value=("create", {"geometry": "1920x1080"}, "headless_xvfb"),
                ),
                patch.object(
                    setup,
                    "manage_session",
                    side_effect=lambda name, action, params: calls.append(
                        (name, action, params)
                    ),
                ),
                patch.object(
                    setup,
                    "_command",
                    return_value=subprocess.CompletedProcess([], 0, "", ""),
                ),
                patch.object(setup, "_worker_version", return_value=VERSION),
                patch.object(
                    setup,
                    "_ensure_virtual_media",
                    side_effect=lambda: calls.append("virtual_media"),
                ),
                patch.object(
                    setup,
                    "status",
                    return_value={"state": "ready", "session_mode": "headless_xvfb"},
                ),
            ):
                result = setup.apply(VERSION)
        self.assertEqual(result["state"], "ready")
        self.assertEqual(
            calls[:7],
            [
                "packages",
                "fonts",
                "voice",
                "virtualgl",
                "accessibility",
                "services",
                ("console", "create", {"geometry": "1920x1080"}),
            ],
        )
        self.assertIn("virtual_media", calls)

    def test_cpu_only_host_does_not_require_virtualgl(self):
        with patch.object(setup.shutil, "which", return_value=None):
            self.assertEqual(
                setup._gpu_status(),
                {
                    "detected": False,
                    "required": False,
                    "ready": True,
                    "renderer": "native",
                },
            )

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
                    "xorgctl-session\u0040console.service",
                    "xorgctl-session\u0040desktop.service",
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
                patch.object(setup, "_install_packages"),
                patch.object(
                    setup, "_install_python", return_value=home / "venv/bin/python"
                ),
                patch.object(setup, "_install_fonts"),
                patch.object(setup, "_install_voice"),
                patch.object(setup, "_install_virtualgl"),
                patch.object(setup, "_configure_accessibility"),
                patch.object(setup, "_install_launcher"),
                patch.object(setup, "_install_services"),
                patch.object(setup, "_ensure_virtual_media"),
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
                    "xorgctl-session\u0040console.service",
                    "xorgctl-session\u0040desktop.service",
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
                    "xorgctl-session\u0040console.service",
                    "xorgctl-session\u0040desktop.service",
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
