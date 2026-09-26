# ruff: noqa: ANN001, ANN003, ANN201, ANN202, D101, D102, PT009, PT027, SLF001
# pylint: disable=protected-access
import pathlib
import subprocess
import sys
import unittest
from unittest.mock import patch

SCRIPTS = pathlib.Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SCRIPTS))

from xorgctl_lib import setup  # noqa: E402
from xorgctl_lib.common import Fault  # noqa: E402


class CameraRecoveryTests(unittest.TestCase):
    def test_virtual_media_recovers_an_unformatted_owned_loopback(self):
        calls: list[str] = []
        with (
            patch.object(setup, "_camera_status", return_value={"ready": True}),
            patch.object(setup, "_camera_output_ready", return_value=False),
            patch.object(
                setup,
                "_recover_virtual_camera",
                side_effect=lambda: calls.append("recover"),
            ),
            patch.object(
                setup,
                "_command",
                side_effect=lambda _argv, **_kwargs: calls.append("start"),
            ),
            patch.object(
                setup,
                "_wait_for_services",
                side_effect=lambda _names: calls.append("ready"),
            ),
            patch.object(
                setup, "rpc", side_effect=lambda *_args: calls.append("audio")
            ),
        ):
            setup._ensure_virtual_media()

        self.assertEqual(calls, ["recover", "start", "ready", "audio"])

    def test_camera_output_ready_requires_the_owned_format(self):
        completed = subprocess.CompletedProcess(
            [],
            0,
            "Width/Height      : 1920/1080\nPixel Format      : 'YU12'\n",
            "",
        )
        with patch.object(setup, "_command", return_value=completed) as command:
            self.assertTrue(setup._camera_output_ready())
        command.assert_called_once_with(
            ["v4l2-ctl", "--device=/dev/video10", "--get-fmt-video-out"],
            timeout=10,
        )

    def test_camera_output_ready_rejects_the_legacy_hd_format(self):
        completed = subprocess.CompletedProcess(
            [],
            0,
            "Width/Height      : 1280/720\nPixel Format      : 'YU12'\n",
            "",
        )
        with patch.object(setup, "_command", return_value=completed):
            self.assertFalse(setup._camera_output_ready())

    def test_loopback_inventory_uses_the_loaded_module_device_numbers(self):
        with patch.object(
            setup.pathlib.Path,
            "read_text",
            return_value="42,10,-1,-1\n",
        ):
            self.assertEqual(
                setup._loopback_devices(),
                ["/dev/video10", "/dev/video42"],
            )

    def test_camera_recovery_refuses_a_busy_owned_device(self):
        calls: list[list[str]] = []

        def command(argv, **_kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 0, "", "")

        with (
            patch.object(setup, "_command", side_effect=command),
            patch.object(setup, "_camera_in_use", return_value=True),
            patch.object(setup, "_loopback_devices", return_value=["/dev/video10"]),
            self.assertRaisesRegex(Fault, "/dev/video10 is in use"),
        ):
            setup._recover_virtual_camera()

        self.assertEqual(
            calls,
            [["systemctl", "--user", "stop", "xcsh-camera.service"]],
        )

    def test_camera_recovery_refuses_an_unrelated_loopback(self):
        calls: list[list[str]] = []

        def command(argv, **_kwargs):
            calls.append(argv)
            return subprocess.CompletedProcess(argv, 0, "", "")

        with (
            patch.object(setup, "_command", side_effect=command),
            patch.object(setup, "_camera_in_use", return_value=False),
            patch.object(
                setup,
                "_loopback_devices",
                return_value=["/dev/video10", "/dev/video42"],
            ),
            self.assertRaisesRegex(Fault, "sole v4l2loopback device"),
        ):
            setup._recover_virtual_camera()

        self.assertEqual(
            calls,
            [["systemctl", "--user", "stop", "xcsh-camera.service"]],
        )
