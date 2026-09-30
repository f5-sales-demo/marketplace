"""Camera process and profile verification."""

# ruff: noqa: D101, D102, D107, INP001, EM101
from __future__ import annotations

import json
import re
import shlex
from typing import Any


class CameraVerification:
    def __init__(self, controller: Any, render: Any, result: Any) -> None:
        self.controller = controller
        self.render = render
        self.result = result

    def producer_matches(self, display: str, pid: int | None) -> bool:
        controller = self.controller
        if not pid:
            return False
        result = controller.runner.run(
            ["ps", "-p", str(pid), "-o", "args="], check=False
        )
        expected = (
            self.render(display, str(controller.state / "authority"))
            .split("ExecStart=", 2)[2]
            .splitlines()[0]
        )
        try:
            return result.returncode == 0 and shlex.split(
                result.stdout.strip()
            ) == shlex.split(expected)
        except ValueError:
            return False

    def camera_live(self, display: str) -> bool:
        controller = self.controller
        result = controller.runner.run(
            [
                "systemctl",
                "--user",
                "show",
                "xcsh-camera.service",
                "-p",
                "MainPID",
                "--value",
            ],
            check=False,
        )
        pid = int(result.stdout.strip()) if result.stdout.strip().isdigit() else None
        fmt = controller.runner.run(
            [
                "v4l2-ctl",
                "--device=/dev/video10",
                "--get-fmt-video-out",
                "--get-output-parm",
            ],
            check=False,
        )
        return bool(
            self.producer_matches(display, pid)
            and fmt.returncode == 0
            and re.search(r"Width/Height\s*:\s*1280/720\b", fmt.stdout)
            and re.search(r"Frames per second:\s*15(?:\.0+)?\b", fmt.stdout)
            and "YU12" in fmt.stdout
        )

    def reconcile_override(self, display: str, xauthority: str) -> bool:
        controller = self.controller
        experimental = controller.dropin.parent / "zz-720-fps-comparison.conf"
        controller.confine(experimental, controller.home)
        if experimental.is_file():
            expected = (
                self.render(display, xauthority)
                .split("[Service]\n", 1)[1]
                .split("Restart=", 1)[0]
            )
            # The accepted local experiment inherits DISPLAY/XAUTHORITY.
            expected = (
                "\n".join(
                    line
                    for line in expected.splitlines()
                    if not line.startswith("Environment=")
                )
                + "\n"
            )
            if experimental.read_text() != "[Service]\n" + expected:
                raise controller.setup_error("camera_override_conflict")
            experimental.unlink()
            return True
        return False

    def window_matches(self, pid: int | None) -> bool:
        controller = self.controller
        windows_result = controller.runner.run(
            [
                controller.xorgctl,
                "--session",
                "zoom-camera",
                "--json",
                "window",
                "list",
            ],
            check=False,
        )
        try:
            windows = self.result(json.loads(windows_result.stdout)).get("windows", [])
        except json.JSONDecodeError:
            windows = []
        ghostty_window: dict[str, Any] = next(
            (item for item in windows if item.get("pid") == pid), {}
        )
        window_matches = all(
            ghostty_window.get(key) == value
            for key, value in {"x": 0, "y": 0, "width": 1280, "height": 720}.items()
        )
        args_result = (
            controller.runner.run(["ps", "-p", str(pid), "-o", "args="], check=False)
            if pid
            else None
        )
        try:
            ghostty_args = shlex.split(args_result.stdout if args_result else "")
        except ValueError:
            ghostty_args = []
        profile_matches = all(
            arg in ghostty_args
            for arg in (
                "--font-size=9",
                "--gtk-single-instance=false",
                f"--config-file={controller.profile}",
                "attach",
                "client-side-defense",
            )
        )
        return window_matches and profile_matches
