"""Dedicated Ghostty camera rendering profile."""

# ruff: noqa: D101, D102, D107, INP001
from __future__ import annotations

from typing import Any


class CameraProfile:
    def __init__(self, controller: Any) -> None:
        self.controller = controller

    def ensure(self) -> bool:
        controller = self.controller
        controller.confine(controller.profile, controller.home)
        source = controller.home / ".config/ghostty/config"
        controller.confine(source, controller.home)
        if controller.profile.is_file():
            existing = controller.profile.read_text()
            accepted = {
                "font-size": "9",
                "adjust-box-thickness": "1",
                "alpha-blending": "linear-corrected",
            }
            values = dict(
                line.split("=", 1)
                for line in existing.splitlines()
                if "=" in line and not line.lstrip().startswith("#")
            )
            values = {key.strip(): value.strip() for key, value in values.items()}
            if all(values.get(key) == value for key, value in accepted.items()):
                controller.runner.run(
                    [
                        "ghostty",
                        "+validate-config",
                        f"--config-file={controller.profile}",
                    ]
                )
                return False
        text = source.read_text() if source.is_file() else ""
        # Copy the user's rendering defaults, replacing only camera overrides.
        keys = (
            "font-size",
            "adjust-box-thickness",
            "alpha-blending",
            "gtk-single-instance",
            "window-decoration",
        )
        text = "\n".join(
            line
            for line in text.splitlines()
            if line.split("=", 1)[0].strip() not in keys
        )
        text += "\nfont-size = 9\nadjust-box-thickness = 1\nalpha-blending = linear-corrected\ngtk-single-instance = false\nwindow-decoration = false\n"
        content = text.encode()
        changed = (
            not controller.profile.is_file()
            or controller.profile.read_bytes() != content
        )
        if changed:
            controller.write(controller.profile, content)
        controller.runner.run(
            ["ghostty", "+validate-config", f"--config-file={controller.profile}"]
        )
        return changed
