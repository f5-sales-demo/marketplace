"""Zoom HD preference: use GUI evidence while Zoom owns its config."""

# ruff: noqa: INP001,  D101, D102, D107, EM101, PLR2004
from __future__ import annotations

import json
import re
import time
from typing import Any


class ZoomHd:
    def __init__(self, controller: Any) -> None:
        self.runner = controller.runner
        self.xorgctl = controller.xorgctl
        self.zoom_config = controller.zoom_config
        self.home = controller.home
        self.gui_session = controller.gui_session
        self.write = controller.write
        self.confined = controller.confine
        self.error = controller.setup_error

    def run_json(self, argv: list[str]) -> dict[str, Any]:
        value = json.loads(self.runner.run(argv).stdout)
        result = value.get("result", value)
        if not isinstance(result, dict):
            raise self.error("zoom_hd_invalid_observation")
        return result

    def hd_enabled(self) -> bool:
        if not self.zoom_config.is_file() or self.zoom_config.is_symlink():
            return False
        return bool(
            re.search(
                r"(?m)^captureHDCamera\s*=\s*true\s*$", self.zoom_config.read_text()
            )
        )

    def ensure_hd(self) -> dict[str, Any]:
        # A running Zoom process owns its config: use its verified GUI instead
        # of racing it with an INI edit. Cold setup can seed the preference.
        listed = self.runner.run(["pgrep", "-x", "zoom"], check=False)
        if listed.returncode == 1:
            self.confined(self.zoom_config, self.home)
            if self.hd_enabled():
                return {"hd": True, "changed": False, "verified": True}
            text = (
                self.zoom_config.read_text()
                if self.zoom_config.is_file()
                else "[General]\n"
            )
            if re.search(r"(?m)^captureHDCamera\s*=", text):
                text = re.sub(
                    r"(?m)^captureHDCamera\s*=.*$", "captureHDCamera=true", text
                )
            elif "[General]" in text:
                text = text.replace("[General]", "[General]\ncaptureHDCamera=true", 1)
            else:
                text += "\n[General]\ncaptureHDCamera=true\n"
            self.write(self.zoom_config, text.encode())
            return {"hd": True, "changed": True, "verified": self.hd_enabled()}
        if listed.returncode != 0:
            raise self.error("zoom_process_state_unknown")
        pids = {int(value) for value in listed.stdout.split() if value.isdigit()}
        session = self.gui_session

        def observe() -> list[dict[str, Any]]:
            value = self.run_json(
                [
                    self.xorgctl,
                    "--session",
                    session,
                    "--json",
                    "inspect",
                    "accessibility",
                ]
            )
            return [
                item
                for item in value.get("items", [])
                if item.get("pid") in pids and item.get("showing") is True
            ]

        def exact(
            items: list[dict[str, Any]], name: str, role: str
        ) -> dict[str, Any] | None:
            matches = [
                item
                for item in items
                if item.get("role") == role
                and str(item.get("name", "")).strip().lower() == name.lower()
            ]
            return matches[0] if len(matches) == 1 else None

        def click(item: dict[str, Any]) -> None:
            box = item.get("box", [])
            if len(box) != 4 or box[2] <= 0 or box[3] <= 0:
                raise self.error("zoom_hd_control_geometry_unknown")
            self.run_json(
                [
                    self.xorgctl,
                    "--session",
                    session,
                    "--json",
                    "input",
                    "batch",
                    "--params",
                    json.dumps(
                        {
                            "allow_focus_change": True,
                            "steps": [
                                {
                                    "action": "click",
                                    "x": round(box[0] + box[2] / 2),
                                    "y": round(box[1] + box[3] / 2),
                                }
                            ],
                        }
                    ),
                ]
            )
            time.sleep(0.3)

        windows = self.run_json(
            [self.xorgctl, "--session", session, "--json", "window", "list"]
        ).get("windows", [])
        meeting = [
            item
            for item in windows
            if item.get("pid") in pids
            and str(item.get("title", "")).strip().lower()
            in ("meeting", "zoom meeting")
        ]
        if len(meeting) == 1:
            self.run_json(
                [
                    self.xorgctl,
                    "--session",
                    session,
                    "--json",
                    "window",
                    "focus",
                    "--params",
                    json.dumps({"window": meeting[0]["id"]}),
                ]
            )
        items = observe()
        hd = exact(items, "HD", "check box")
        opened = False
        if hd is None:
            settings = exact(
                items, "Video Settings, menu item", "push button"
            ) or exact(items, "Video Settings", "push button")
            if settings is None:
                raise self.error("zoom_hd_gui_unavailable")
            click(settings)
            items = observe()
            choices = [
                item
                for item in items
                if str(item.get("name", "")).strip().lower()
                in ("video & effects settings", "video settings...")
                and item.get("role") == "menu item"
            ]
            if len(choices) != 1:
                raise self.error("zoom_hd_gui_unavailable")
            click(choices[0])
            opened = True
            items = observe()
            hd = exact(items, "HD", "check box")
        if hd is None or not isinstance(hd.get("checked"), bool):
            raise self.error("zoom_hd_state_unknown")
        changed = not hd["checked"]
        if changed:
            click(hd)
            hd = exact(observe(), "HD", "check box")
        if hd is None or hd.get("checked") is not True:
            raise self.error("zoom_hd_verification_failed")
        if opened:
            items = observe()
            close = [
                item
                for item in items
                if item.get("role") == "push button"
                and str(item.get("name", "")).strip().lower()
                in ("close", "close panel")
            ]
            if len(close) == 1:
                click(close[0])
        return {"hd": True, "changed": changed, "verified": True}
