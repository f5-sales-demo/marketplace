# ruff: noqa: ANN001, ANN003, ANN201, ANN204, D101, D102, D107, PLR0911, PLR2004, S603, S607
# pylint: disable=too-many-locals,too-many-return-statements,too-many-branches,too-many-statements,consider-using-with,unidiomatic-typecheck
"""Explicit Hyprland backend; bounded native operations with no X11 substitution."""

from __future__ import annotations

import json
import os
import pathlib
import re
import signal
import subprocess
import tempfile
import time

from .common import Fault, run


class Hyprland:
    def __init__(self, env=None):
        self.env = dict(os.environ if env is None else env)
        runtime = pathlib.Path(self.env.get("XDG_RUNTIME_DIR", ""))
        signature = self.env.get("HYPRLAND_INSTANCE_SIGNATURE", "")
        display = self.env.get("WAYLAND_DISPLAY", "")
        if (
            not runtime.is_absolute()
            or runtime.is_symlink()
            or runtime.stat().st_uid != os.getuid()
            or not re.fullmatch(r"[A-Za-z0-9_-]+", signature)
            or not re.fullmatch(r"[A-Za-z0-9_-]+", display)
        ):
            message = (
                "Explicit owned Wayland runtime, display and Hyprland instance required"
            )
            raise Fault(message)
        socket = runtime / display
        if not socket.is_socket() or socket.stat().st_uid != os.getuid():
            message = "Selected Wayland socket is unavailable or not owned by caller"
            raise Fault(message)

    def command(self, argv, **kwargs):
        return run(argv, env=self.env, **kwargs).stdout

    def query(self, name):
        return json.loads(self.command(["hyprctl", "-j", name]))

    def capabilities(self):
        return {
            "backend": "wayland",
            "compositor": "Hyprland",
            "coordinate_space": "Wayland compositor logical pixels",
            "capabilities": {
                "windows": True,
                "screenshots": True,
                "clipboard": True,
                "atomic_shortcuts": True,
                "pointer_move": True,
                "text_input": False,
                "held_input_leases": False,
                "screen_recording": True,
            },
            "limitations": [
                "No held key/button leases or arbitrary text injection",
                "Screenshots use grim and physical output pixels",
                "Bounded screen-only capture uses wf-recorder; audio is not captured",
            ],
        }

    def windows(self):
        return [
            {
                "id": w["address"],
                "pid": w["pid"],
                "title": w["title"],
                "class": w["class"],
                "x": w["at"][0],
                "y": w["at"][1],
                "width": w["size"][0],
                "height": w["size"][1],
                "xwayland": w["xwayland"],
                "backend": "wayland",
            }
            for w in self.query("clients")
            if w.get("mapped") and not w.get("hidden")
        ]

    def dispatch(self, command, action, params, payload=None):
        if command == "capabilities":
            return self.capabilities(), None
        if command == "session" and action in (None, "status", "attach"):
            return {**self.capabilities(), "outputs": self.query("monitors")}, None
        if command == "display" and action in (None, "info"):
            return {"backend": "wayland", "outputs": self.query("monitors")}, None
        if command == "window" and action in (None, "list"):
            return {"backend": "wayland", "windows": self.windows()}, None
        if command == "window" and action == "focus":
            target = params.get("window")
            if target not in {w["id"] for w in self.windows()}:
                message = "Window target expired; discover windows again"
                raise Fault(message)
            self.command(["hyprctl", "dispatch", "focuswindow", "address:" + target])
            return {"backend": "wayland", "focused": target}, None
        if command == "screenshot":
            output = params.get("output_name")
            monitors = self.query("monitors")
            if output and output not in {m["name"] for m in monitors}:
                message = "Output target expired; discover outputs again"
                raise Fault(message)
            if not monitors:
                message = "Selected compositor has no active outputs"
                raise Fault(message)
            with tempfile.TemporaryDirectory(prefix="xorgctl-wayland-") as tmp:
                path = pathlib.Path(tmp) / "frame.png"
                argv = ["grim"] + (["-o", output] if output else [])
                region = params.get("region")
                if region is not None:
                    if (
                        not isinstance(region, list)
                        or len(region) != 4
                        or any(type(x) is not int for x in region)
                    ):
                        message = "Region must contain four integer logical coordinates"
                        raise Fault(message)
                    x, y, width, height = region
                    if (
                        width <= 0
                        or height <= 0
                        or not any(
                            x >= m["x"]
                            and y >= m["y"]
                            and x + width <= m["x"] + m["width"] / m["scale"]
                            and y + height <= m["y"] + m["height"] / m["scale"]
                            for m in monitors
                        )
                    ):
                        message = "Region outside a selected output"
                        raise Fault(message)
                    argv += ["-g", f"{x},{y} {width}x{height}"]
                self.command([*argv, str(path)], timeout=15)
                data = path.read_bytes()
            return {
                "backend": "wayland",
                "source": "grim compositor capture",
                "bytes": len(data),
            }, data
        if command == "record" and action == "screen":
            seconds = params.get("seconds", 3)
            fps = params.get("fps", 10)
            if (
                type(seconds) is not int
                or not 1 <= seconds <= 30
                or type(fps) is not int
                or not 1 <= fps <= 30
            ):
                message = "Screen capture requires 1-30 seconds and 1-30 fps"
                raise Fault(message)
            outputs = self.query("monitors")
            output = params.get("output_name") or (
                outputs[0]["name"] if outputs else None
            )
            if not isinstance(output, str) or output not in {
                m["name"] for m in outputs
            }:
                message = "Capture requires an active selected output"
                raise Fault(message)
            with tempfile.TemporaryDirectory(prefix="xorgctl-wayland-capture-") as tmp:
                path = pathlib.Path(tmp) / "capture.mkv"
                with tempfile.TemporaryFile() as log:
                    process = subprocess.Popen(
                        [
                            "wf-recorder",
                            "-o",
                            output,
                            "-r",
                            str(fps),
                            "-D",
                            "-f",
                            str(path),
                        ],
                        env=self.env,
                        stdout=log,
                        stderr=log,
                        start_new_session=True,
                    )
                    try:
                        deadline = time.monotonic() + seconds
                        while time.monotonic() < deadline and process.poll() is None:
                            time.sleep(0.05)
                        if process.poll() is None:
                            process.send_signal(signal.SIGINT)
                        process.wait(timeout=5)
                        if process.returncode != 0 or not path.is_file():
                            message = "Native screen capture failed"
                            raise Fault(message)
                        data = path.read_bytes()
                    finally:
                        if process.poll() is None:
                            os.killpg(process.pid, signal.SIGKILL)
                            process.wait()
            return {
                "backend": "wayland",
                "source": "wf-recorder",
                "audio": False,
                "output": output,
                "seconds": seconds,
                "fps_requested": fps,
                "bytes": len(data),
            }, data
        if command == "clipboard":
            selection = params.get("selection", "CLIPBOARD")
            if selection not in ("PRIMARY", "CLIPBOARD"):
                message = "Selection must be PRIMARY or CLIPBOARD"
                raise Fault(message)
            primary = selection == "PRIMARY"
            args = ["--primary"] if primary else []
            if action in (None, "info"):
                types = (
                    self.command(["wl-paste", *args, "--list-types"], timeout=5)
                    .decode()
                    .splitlines()
                )
                return {"backend": "wayland", "types": types}, None
            if action in ("get", "text"):
                data = self.command(["wl-paste", *args, "--no-newline"], timeout=5)
                return {"backend": "wayland", "text": data.decode()}, None
            if action == "set":
                data = (
                    payload if payload is not None else params.get("text", "").encode()
                )
                if len(data) > 8 * 1024 * 1024:
                    message = "Clipboard payload exceeds bounded limit"
                    raise Fault(message)
                # Background clipboard owner must not inherit captured stdout/stderr,
                # or subprocess capture waits forever for descriptors to close.
                with tempfile.TemporaryFile() as src:
                    src.write(data)
                    src.seek(0)
                    subprocess.run(
                        [
                            "wl-copy",
                            *args,
                            "--type",
                            params.get("mime", "text/plain;charset=utf-8"),
                        ],
                        stdin=src,
                        stdout=subprocess.DEVNULL,
                        stderr=subprocess.DEVNULL,
                        env=self.env,
                        timeout=5,
                        check=True,
                    )
                return {
                    "backend": "wayland",
                    "bytes": len(data),
                    "ownership": "wl-copy background owner",
                }, None
        if command == "input" and action == "batch":
            steps = params.get("steps")
            if not isinstance(steps, list) or not 1 <= len(steps) <= 100:
                message = "Input requires 1-100 bounded steps"
                raise Fault(message)
            # Validate every step before mutating. Atomic shortcuts avoid held input
            # surviving interruption; explicit down/up/retain is unsupported.
            normalized = []
            for step in steps:
                if not isinstance(step, dict):
                    message = "Every input step must be an object"
                    raise Fault(message)
                kind = step.get("action")
                if kind == "key":
                    key = step.get("key", "")
                    modifiers = step.get("modifiers", "")
                    if not re.fullmatch(r"[A-Za-z0-9_]+", key) or any(
                        m not in {"SHIFT", "CTRL", "ALT", "SUPER"}
                        for m in modifiers.split()
                    ):
                        message = "Invalid atomic shortcut"
                        raise Fault(message)
                    normalized.append(
                        [
                            "hyprctl",
                            "dispatch",
                            "sendshortcut",
                            f"{modifiers},{key},activewindow",
                        ]
                    )
                elif kind == "move":
                    x, y = step.get("x"), step.get("y")
                    if (
                        type(x) is not int
                        or type(y) is not int
                        or not any(
                            m["x"] <= x < m["x"] + m["width"] / m["scale"]
                            and m["y"] <= y < m["y"] + m["height"] / m["scale"]
                            for m in self.query("monitors")
                        )
                    ):
                        message = "Pointer target outside selected output"
                        raise Fault(message)
                    normalized.append(["hyprctl", "dispatch", "movecursor", f"{x} {y}"])
                else:
                    message = "Unsupported Wayland input; capability discovery required"
                    raise Fault(message)
            start = time.monotonic()
            for argv in normalized:
                if time.monotonic() - start > 10:
                    message = "Input batch deadline reached"
                    raise Fault(message)
                self.command(argv, timeout=2)
            return {
                "backend": "wayland",
                "completed": len(normalized),
                "held_input": False,
            }, None
        message = (
            "Operation unsupported by native Wayland backend; inspect capabilities"
        )
        raise Fault(message)
