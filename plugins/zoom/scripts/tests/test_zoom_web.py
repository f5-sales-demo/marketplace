# ruff: noqa: ANN201, D101, D102, PT009, PT027
import importlib.util
import unittest
from pathlib import Path
from unittest.mock import patch

spec = importlib.util.spec_from_file_location(
    "zoom_web", Path(__file__).parents[1] / "zoom-web.py"
)
if spec is None or spec.loader is None:
    MESSAGE = "Cannot load Zoom Web test module"
    raise RuntimeError(MESSAGE)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class ZoomWebSafety(unittest.TestCase):
    def test_numeric_id_and_zoom_https_invitation_only(self):
        self.assertEqual(
            module.invitation("12345678901"), "https://app.zoom.us/wc/join/12345678901"
        )
        self.assertEqual(
            module.invitation("https://us06web.zoom.us/j/12345678901"),
            "https://us06web.zoom.us/j/12345678901",
        )
        for url in (
            "http://zoom.us/j/12345678901",
            "https://zoom.us.evil.test/j/12345678901",
            "https://user@zoom.us/j/12345678901",
            "https://zoom.us:444/j/12345678901",
            "https://zoom.us/profile",
            "123",
        ):
            with self.assertRaises(ValueError):
                module.invitation(url)

    def test_join_cannot_launch_when_baked_media_missing(self):
        with (
            patch.object(module, "status", return_value={"ready": False}),
            patch.object(module.subprocess, "Popen") as launch,
        ):
            result = module.join("12345678901")
        self.assertEqual(result["exitCode"], 1)
        launch.assert_not_called()

    def test_status_cannot_claim_receiver_acceptance_or_recording(self):
        with (
            patch.object(module.shutil, "which", return_value=None),
            patch.object(module.subprocess, "run", side_effect=FileNotFoundError),
        ):
            result = module.status()
        self.assertFalse(result["ready"])
        self.assertFalse(result["recording"])
        self.assertEqual(result["receiver_acceptance"], "pending controlled meeting")
