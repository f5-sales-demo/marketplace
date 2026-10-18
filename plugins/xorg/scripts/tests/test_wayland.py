# ruff: noqa: ANN001, ANN201, D101, D102, PT009, PT027
"""Native backend boundaries; no display required for deterministic contracts."""

import socket
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from xorgctl_lib.common import Fault
from xorgctl_lib.wayland import Hyprland


class WaylandContract(unittest.TestCase):
    def backend(self, directory):
        runtime = Path(directory)
        listener = socket.socket(socket.AF_UNIX)
        listener.bind(str(runtime / "wayland-test"))
        self.addCleanup(listener.close)
        return Hyprland(
            {
                "XDG_RUNTIME_DIR": str(runtime),
                "WAYLAND_DISPLAY": "wayland-test",
                "HYPRLAND_INSTANCE_SIGNATURE": "owned_test",
            }
        )

    def test_missing_or_foreign_runtime_cannot_be_selected(self):
        with self.assertRaises((Fault, OSError)):
            Hyprland({})
        with tempfile.TemporaryDirectory() as directory, self.assertRaises(Fault):
            Hyprland(
                {
                    "XDG_RUNTIME_DIR": directory,
                    "WAYLAND_DISPLAY": "../other",
                    "HYPRLAND_INSTANCE_SIGNATURE": "test",
                }
            )

    def test_wayland_windows_preserve_xwayland_identity(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = self.backend(directory)
            rows = [
                {
                    "address": "0x123",
                    "pid": 1,
                    "title": "owned",
                    "class": "example",
                    "at": [10, 20],
                    "size": [100, 80],
                    "xwayland": True,
                    "mapped": True,
                }
            ]
            with patch.object(backend, "query", return_value=rows):
                result = backend.windows()
            self.assertEqual(result[0]["id"], "0x123")
            self.assertTrue(result[0]["xwayland"])

    def test_entire_input_batch_validated_before_any_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = self.backend(directory)
            with patch.object(backend, "command") as command, self.assertRaises(Fault):
                backend.dispatch(
                    "input",
                    "batch",
                    {
                        "steps": [
                            {"action": "key", "key": "Return"},
                            {"action": "down", "key": "Control"},
                        ]
                    },
                )
            command.assert_not_called()

    def test_outside_pointer_and_expired_window_are_rejected(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = self.backend(directory)
            with (
                patch.object(
                    backend,
                    "query",
                    return_value=[
                        {"x": 0, "y": 0, "width": 1920, "height": 1080, "scale": 1}
                    ],
                ),
                patch.object(backend, "command") as command,
                self.assertRaises(Fault),
            ):
                backend.dispatch(
                    "input", "batch", {"steps": [{"action": "move", "x": 1920, "y": 0}]}
                )
            command.assert_not_called()
            with (
                patch.object(backend, "windows", return_value=[]),
                self.assertRaises(Fault),
            ):
                backend.dispatch("window", "focus", {"window": "0x123"})

    def test_clipboard_background_owner_inherits_no_capture_pipes(self):
        with tempfile.TemporaryDirectory() as directory:
            backend = self.backend(directory)
            with patch("xorgctl_lib.wayland.subprocess.run") as run:
                result, _data = backend.dispatch("clipboard", "set", {"text": "sample"})
            self.assertEqual(result["bytes"], 6)
            self.assertEqual(run.call_args.kwargs["stdout"], subprocess.DEVNULL)
            self.assertEqual(run.call_args.kwargs["stderr"], subprocess.DEVNULL)

    def test_capabilities_report_bounded_capture_without_held_input(self):
        with tempfile.TemporaryDirectory() as directory:
            capabilities = self.backend(directory).capabilities()["capabilities"]
            self.assertFalse(capabilities["held_input_leases"])
            self.assertTrue(capabilities["screen_recording"])
            self.assertTrue(capabilities["screenshots"])
