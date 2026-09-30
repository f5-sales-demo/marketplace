# ruff: noqa: ANN001, ANN201, ANN202, ARG005, D101, D102, D107, PLR0911, PT009, PT018, PT027, S101, S108
# mypy: ignore-errors
# pylint: disable=too-many-return-statements
from __future__ import annotations

import importlib.util
import json
import pathlib
import stat
import sys
import tempfile
import unittest

SCRIPT = pathlib.Path(__file__).parents[1] / "zoom-setup.py"
SPEC = importlib.util.spec_from_file_location("zoom_setup", SCRIPT)
assert SPEC and SPEC.loader
zoom_setup = importlib.util.module_from_spec(SPEC)
sys.modules[SPEC.name] = zoom_setup
SPEC.loader.exec_module(zoom_setup)


class FakeRunner:
    def __init__(self) -> None:
        self.calls: list[list[str]] = []
        self.package = zoom_setup.ZOOM_VERSION
        self.existing_herdr = True
        self.session_environment = {"DISPLAY": ":91", "XAUTHORITY": "/tmp/Xauthority"}

    def run(self, argv: list[str], *, check: bool = True):
        self.calls.append(argv)
        joined = " ".join(argv)
        if argv[0] == "dpkg-query":
            return zoom_setup.CommandResult(0, self.package)
        if argv[:3] == ["xorgctl", "--json", "capabilities"]:
            return zoom_setup.CommandResult(
                0, json.dumps({"result": {"version": "1.1.9"}})
            )
        if argv[:2] == ["herdr", "--version"]:
            return zoom_setup.CommandResult(0, "herdr 0.19.2")
        if argv[:2] == ["ghostty", "--version"]:
            return zoom_setup.CommandResult(0, "Ghostty 1.3.1")
        if argv[:2] == ["xcsh", "--version"]:
            return zoom_setup.CommandResult(0, "xcsh 22.3.6")
        if "session list" in joined and argv[0] == "xorgctl":
            return zoom_setup.CommandResult(
                0, json.dumps({"result": {"sessions": [{"name": "zoom-camera"}]}})
            )
        if "session status" in joined:
            return zoom_setup.CommandResult(
                0,
                json.dumps(
                    {
                        "result": {
                            "geometry": "1920x1080",
                            "owned": True,
                            "env": self.session_environment,
                        }
                    }
                ),
            )
        if argv[:3] == ["herdr", "session", "list"]:
            sessions = (
                [{"name": "client-side-defense", "running": True}]
                if self.existing_herdr
                else []
            )
            return zoom_setup.CommandResult(0, json.dumps({"sessions": sessions}))
        if argv[0] == "herdr" and "pane" in argv and "list" in argv:
            return zoom_setup.CommandResult(
                0,
                json.dumps(
                    {"result": {"panes": [{"pane_id": "w1:p1", "agent": "xcsh"}]}}
                ),
            )
        if "app launch" in joined:
            return zoom_setup.CommandResult(0, json.dumps({"result": {"pid": 444}}))
        if "window list" in joined:
            return zoom_setup.CommandResult(
                0, json.dumps({"result": {"windows": [{"id": 9, "pid": 444}]}})
            )
        if "app list" in joined:
            return zoom_setup.CommandResult(
                0,
                json.dumps(
                    {"result": {"owned_processes": [{"pid": 444, "running": True}]}}
                ),
            )
        if argv[0] == "systemctl" and "is-active" in argv:
            return zoom_setup.CommandResult(0, "active\n")
        if argv[0] == "systemctl" and "MainPID" in argv:
            return zoom_setup.CommandResult(0, "555\n")
        if argv[0] == "v4l2-ctl":
            return zoom_setup.CommandResult(
                0, "Width/Height : 1920/1080\nPixel Format : 'YU12'"
            )
        return zoom_setup.CommandResult(0, "{}")


class ZoomSetupTests(unittest.TestCase):
    def test_command_environment_keeps_user_and_system_launchers(self):
        environment = zoom_setup.command_environment(
            {"HOME": "/home/robin", "PATH": "/custom"}
        )
        self.assertEqual(
            environment["PATH"].split(":"),
            [
                "/home/robin/.local/bin",
                "/usr/local/sbin",
                "/usr/local/bin",
                "/usr/sbin",
                "/usr/bin",
                "/sbin",
                "/bin",
                "/custom",
            ],
        )

    def test_package_selection_and_conflicts(self):
        self.assertEqual(zoom_setup.select_package_action(None, False), "install")
        self.assertEqual(
            zoom_setup.select_package_action(zoom_setup.ZOOM_VERSION, False),
            "reinstall",
        )
        self.assertEqual(zoom_setup.select_package_action("7.1.0.1", True), "upgrade")
        with self.assertRaisesRegex(
            zoom_setup.SetupError, "unknown_conflicting_installation"
        ):
            zoom_setup.select_package_action("7.1.0.1", False)
        with self.assertRaisesRegex(zoom_setup.SetupError, "downgrade_refused"):
            zoom_setup.select_package_action("7.3.0.1", True)

    def test_digest_validation(self):
        self.assertEqual(
            zoom_setup.ZOOM_URL, "https://cdn.zoom.us/prod/7.2.1.5760/zoom_amd64.deb"
        )
        self.assertEqual(
            zoom_setup.ZOOM_SHA256,
            "e9a522c794622633b24908ac0589a8e4df8a542846b97818e76f6c27e117cbdb",
        )
        with tempfile.TemporaryDirectory() as directory:
            path = pathlib.Path(directory) / "zoom.deb"
            path.write_bytes(b"artifact")
            self.assertEqual(
                zoom_setup.sha256_file(path),
                "c7c5c1d70c5dec4416ab6158afd0b223ef40c29b1dc1f97ed9428b94d4cadb1c",
            )

    def test_unit_captures_only_isolated_display(self):
        unit = zoom_setup.render_camera_unit(":91", "/tmp/Xauthority")
        self.assertIn("-f x11grab", unit)
        self.assertIn("-video_size 1920x1080 -i :91", unit)
        self.assertIn("-pix_fmt yuv420p -r 30", unit)
        self.assertIn("/dev/video10", unit)
        self.assertIn("Environment=XAUTHORITY=/tmp/Xauthority", unit)
        self.assertNotIn("v4l2-ctl", unit)
        self.assertNotIn("testsrc", unit)
        with self.assertRaisesRegex(zoom_setup.SetupError, "invalid_display"):
            zoom_setup.render_camera_unit(":0;touch /tmp/no", "/tmp/Xauthority")

    def test_symlink_confinement_and_owner_only_receipt(self):
        with tempfile.TemporaryDirectory() as directory:
            root = pathlib.Path(directory)
            outside = root / "outside"
            outside.mkdir()
            link = root / "link"
            link.symlink_to(outside, target_is_directory=True)
            with self.assertRaisesRegex(zoom_setup.SetupError, "symlink_refused"):
                zoom_setup.ensure_confined(link / "receipt.json", root)
            receipt = root / "receipt.json"
            zoom_setup.atomic_write(receipt, b"{}\n")
            self.assertEqual(stat.S_IMODE(receipt.stat().st_mode), 0o600)

    def test_existing_session_attaches_without_xcsh_start(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()
            controller = zoom_setup.Controller(runner, pathlib.Path(directory))
            created, pid = controller.ensure_herdr_window()
            self.assertFalse(created)
            self.assertEqual(pid, 444)
            launch = next(call for call in runner.calls if "launch" in call)
            launch_argv = json.loads(launch[-1])["argv"]
            self.assertIn("--gtk-single-instance=false", launch_argv)
            self.assertIn("attach", launch_argv)
            self.assertNotIn("xcsh", launch_argv)

    def test_new_session_starts_xcsh_once(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()
            runner.existing_herdr = False
            pane_calls = 0
            original_run = runner.run

            def run(argv, *, check=True):
                nonlocal pane_calls
                if argv[0] == "herdr" and "pane" in argv and "list" in argv:
                    pane_calls += 1
                    return zoom_setup.CommandResult(
                        0, json.dumps({"result": {"panes": [{"pane_id": "w1:p1"}]}})
                    )
                return original_run(argv, check=check)

            runner.run = run
            controller = zoom_setup.Controller(runner, pathlib.Path(directory))
            created, _ = controller.ensure_herdr_window()
            self.assertTrue(created)
            starts = [call for call in runner.calls if call[-1:] == ["xcsh"]]
            self.assertEqual(len(starts), 1)
            self.assertEqual(pane_calls, 1)

    def test_status_requires_real_camera_producer_and_provenance(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()
            controller = zoom_setup.Controller(runner, pathlib.Path(directory))
            controller.state.mkdir(parents=True)
            receipt = {
                "plugin_version": zoom_setup.PLUGIN_VERSION,
                "zoom_version": zoom_setup.ZOOM_VERSION,
                "camera_label": zoom_setup.CAMERA_LABEL,
                "geometry": zoom_setup.GEOMETRY,
                "display": ":91",
                "ghostty_pid": 444,
            }
            zoom_setup.atomic_write(
                controller.receipt, (json.dumps(receipt) + "\n").encode()
            )
            status = controller.status()
            self.assertTrue(status["ready"])
            self.assertEqual(status["producer_pid"], 555)
            original_run = runner.run

            def with_legacy_display(argv, *, check=True):
                result = original_run(argv, check=check)
                if "session" in argv and "status" in argv:
                    value = json.loads(result.stdout)
                    value["result"]["display"] = ":91"
                    return zoom_setup.CommandResult(0, json.dumps(value))
                return result

            runner.run = with_legacy_display
            for environment in ({}, {"DISPLAY": ""}, {"DISPLAY": ":92"}, None):
                with self.subTest(environment=environment):
                    runner.session_environment = environment
                    self.assertFalse(controller.status()["ready"])
            runner.run = lambda argv, check=True: zoom_setup.CommandResult(
                0, "inactive\n"
            )
            self.assertFalse(controller.status()["ready"])

    def test_apply_recovers_service_and_second_run_is_byte_identical(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()

            class TestController(zoom_setup.Controller):
                def ensure_zoom_package(self):
                    return "verify"

            controller = TestController(runner, pathlib.Path(directory))
            first = controller.apply()
            self.assertTrue(first["ready"])
            self.assertTrue(first["changed"])
            before = (controller.receipt.read_bytes(), controller.dropin.read_bytes())

            def metadata():
                return tuple(
                    (path.stat().st_mtime_ns, path.stat().st_ino, path.stat().st_mode)
                    for path in (controller.receipt, controller.dropin)
                )

            before_metadata = metadata()
            calls = len(runner.calls)
            second = controller.apply()
            self.assertTrue(second["ready"])
            self.assertEqual(before_metadata, metadata())
            self.assertFalse(
                any(
                    "restart" in call or "launch" in call or "daemon-reload" in call
                    for call in runner.calls[calls:]
                )
            )
            self.assertFalse(second["changed"])
            self.assertEqual(
                before,
                (controller.receipt.read_bytes(), controller.dropin.read_bytes()),
            )
            self.assertIn(
                ["systemctl", "--user", "restart", "xcsh-camera.service"], runner.calls
            )

    def test_failed_readiness_rolls_back_managed_files(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()
            root = pathlib.Path(directory)

            class TestController(zoom_setup.Controller):
                def ensure_zoom_package(self):
                    return "verify"

                def status(self):
                    return {"ready": False}

            controller = TestController(runner, root)
            controller.dropin.parent.mkdir(parents=True)
            controller.receipt.parent.mkdir(parents=True)
            controller.dropin.write_bytes(b"old unit\n")
            controller.receipt.write_bytes(b"old receipt\n")
            controller.receipt.chmod(0o600)
            with self.assertRaisesRegex(zoom_setup.SetupError, "readiness_failed"):
                controller.apply()
            self.assertEqual(controller.dropin.read_bytes(), b"old unit\n")
            self.assertEqual(controller.receipt.read_bytes(), b"old receipt\n")

    def test_dependency_versions_fail_closed(self):
        with tempfile.TemporaryDirectory() as directory:
            runner = FakeRunner()
            original = runner.run

            def run(argv, *, check=True):
                if argv[:2] == ["herdr", "--version"]:
                    return zoom_setup.CommandResult(0, "herdr 0.19.1")
                return original(argv, check=check)

            runner.run = run
            with self.assertRaisesRegex(
                zoom_setup.SetupError, "dependency_version_mismatch"
            ):
                zoom_setup.Controller(runner, pathlib.Path(directory)).dependencies()

    def test_resolves_the_user_local_xorg_launcher_when_path_omits_it(self):
        with tempfile.TemporaryDirectory() as directory:
            home = pathlib.Path(directory)
            launcher = home / ".local" / "bin" / "xorgctl"
            launcher.parent.mkdir(parents=True)
            launcher.write_text("#!/bin/sh\n")
            launcher.chmod(0o700)
            controller = zoom_setup.Controller(FakeRunner(), home)
            self.assertEqual(controller.xorgctl, str(launcher))


if __name__ == "__main__":
    unittest.main()
