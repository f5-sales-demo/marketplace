# ruff: noqa: ANN201, D101, D102, PT009, PT027
import importlib.util
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

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
            "https://app.zoom.us/wc/join/12345678901",
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
            "https://app.zoom.us/wc/join/12345678901?pwd=synthetic-token",
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

    def test_hd_control_is_enabled_and_verified_when_offered(self):
        page = MagicMock()
        tab = page.locator.return_value
        tab.count.return_value = 1
        hd = page.get_by_label.return_value
        hd.count.return_value = 1
        hd.is_visible.return_value = True
        hd.is_checked.side_effect = [False, True, True]
        close = page.locator.return_value.locator.return_value
        close.count.return_value = 0
        result = module.ensure_web_hd(page)
        hd.check.assert_called_once_with(timeout=3000)
        self.assertEqual(result, {"hd": True, "verified": True, "changed": True})

    def test_video_settings_not_ready_remains_pending(self):
        page = MagicMock()
        tab, menu, more = MagicMock(), MagicMock(), MagicMock()
        page.locator.side_effect = [tab, menu, more]
        tab.count.return_value = 0
        menu.count.return_value = 0
        more.count.return_value = 1
        result = module.ensure_web_hd(page)
        self.assertEqual(result["hd"], "pending")
        self.assertEqual(result["reason"], "web_video_settings_unavailable")
        self.assertFalse(result["verified"])

    def test_missing_hd_control_is_explicit_not_success(self):
        page = MagicMock()
        page.locator.return_value.count.return_value = 1
        page.get_by_label.return_value.count.return_value = 0
        page.locator.return_value.filter.return_value.count.return_value = 0
        page.locator.return_value.locator.return_value.count.return_value = 0
        result = module.ensure_web_hd(page)
        self.assertEqual(result["hd"], "unavailable")
        self.assertFalse(result["verified"])

    def test_browser_process_title_supports_chrome_rewritten_and_normal_argv(self):
        for raw in (
            b"/opt/google/chrome/chrome\x00--user-data-dir=/run/profile\x00",
            b"/opt/google/chrome/chrome --user-data-dir=/run/profile\x00",
        ):
            with patch.object(Path, "read_bytes", return_value=raw):
                self.assertEqual(
                    module.browser_process_arguments(1),
                    [b"/opt/google/chrome/chrome", b"--user-data-dir=/run/profile"],
                )
