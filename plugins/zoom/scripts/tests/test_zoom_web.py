# ruff: noqa: ANN201, D101, D102, PT009, PT027
import importlib.util
import json
import os
import tempfile
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
            "https://us06web.zoom.us/wc/join/12345678901",
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

    def test_web_invitation_preserves_join_parameters(self):
        self.assertEqual(
            module.invitation(
                "https://us06web.zoom.us/j/12345678901?pwd=synthetic-token#fragment"
            ),
            "https://us06web.zoom.us/wc/join/12345678901?pwd=synthetic-token",
        )

    def test_owned_browser_rejects_foreign_or_invalid_state_before_attach(self):
        with tempfile.TemporaryDirectory() as directory:
            state = Path(directory) / "pi-zoom-web-state.json"
            state.write_text(json.dumps({"port": True, "pid": 1, "profile": directory}))
            state.chmod(0o600)
            with (
                patch.dict(os.environ, {"XDG_RUNTIME_DIR": directory}),
                self.assertRaises(ValueError),
            ):
                module.owned_browser_state()
            state.chmod(0o644)
            with (
                patch.dict(os.environ, {"XDG_RUNTIME_DIR": directory}),
                self.assertRaises(ValueError),
            ):
                module.owned_browser_state()

    def test_display_name_defaults_to_product_identity_and_allows_override(self):
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(module.display_name(), "xcsh")
        with patch.dict(os.environ, {"XCSH_ZOOM_DISPLAY_NAME": "xcsh lab"}):
            self.assertEqual(module.display_name(), "xcsh lab")
        for invalid in ("", "x" * 65, "xcsh\nlab"):
            with self.assertRaises(ValueError):
                module.display_name(invalid)
