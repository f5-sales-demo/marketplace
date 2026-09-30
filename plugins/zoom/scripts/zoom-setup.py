#!/usr/bin/env python3
# ruff: noqa: D101, D102, D103, D107, EM101, EM102, PLR2004, S603, T201, TRY300, TRY301
# pylint: disable=invalid-name
"""Install and verify Zoom's isolated terminal-camera pipeline."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import pathlib
import platform
import re
import shlex
import stat
import subprocess
import sys
import tempfile
import time
from dataclasses import dataclass
from typing import Any

from camera_profile import CameraProfile
from camera_verification import CameraVerification
from zoom_hd import ZoomHd

PLUGIN_VERSION = "1.1.11"
ZOOM_VERSION = "7.2.1.5760"
ZOOM_URL = "https://cdn.zoom.us/prod/7.2.1.5760/zoom_amd64.deb"
ZOOM_SHA256 = "e9a522c794622633b24908ac0589a8e4df8a542846b97818e76f6c27e117cbdb"
SESSION = "zoom-camera"
HERDR_SESSION = "client-side-defense"
GEOMETRY = "1280x720"
DESKTOP_GEOMETRY = "1920x1080"
CAMERA = "/dev/video10"
CAMERA_LABEL = "xcsh Camera"
FPS = 15


class SetupError(RuntimeError):
    pass


@dataclass(frozen=True)
class CommandResult:
    returncode: int
    stdout: str = ""
    stderr: str = ""


def command_environment(source: dict[str, str] | None = None) -> dict[str, str]:
    environment = dict(source or os.environ)
    user_bin = str(
        pathlib.Path(environment.get("HOME", str(pathlib.Path.home())))
        / ".local"
        / "bin"
    )
    standard = (
        "/usr/local/sbin",
        "/usr/local/bin",
        "/usr/sbin",
        "/usr/bin",
        "/sbin",
        "/bin",
    )
    paths: list[str] = []
    for entry in (user_bin, *standard, *environment.get("PATH", "").split(os.pathsep)):
        if entry and entry not in paths:
            paths.append(entry)
    environment["PATH"] = os.pathsep.join(paths)
    return environment


class Runner:
    def __init__(self, environment: dict[str, str] | None = None) -> None:
        self.environment = command_environment(environment)

    def run(self, argv: list[str], *, check: bool = True) -> CommandResult:
        result = subprocess.run(
            argv, check=False, capture_output=True, text=True, env=self.environment
        )
        value = CommandResult(result.returncode, result.stdout, result.stderr)
        if check and value.returncode:
            raise SetupError(f"command_failed:{pathlib.Path(argv[0]).name}")
        return value


def sha256_file(path: pathlib.Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def require_platform(system: str | None = None, machine: str | None = None) -> None:
    if (system or platform.system()) != "Linux" or (
        machine or platform.machine()
    ) not in {
        "x86_64",
        "amd64",
    }:
        raise SetupError("unsupported_platform:requires_ubuntu_amd64")
    try:
        values = dict(
            line.split("=", 1)
            for line in pathlib.Path("/etc/os-release").read_text().splitlines()
            if "=" in line
        )
    except OSError as error:
        raise SetupError("unsupported_platform:os_release") from error
    if values.get("ID", "").strip('"') != "ubuntu":
        raise SetupError("unsupported_platform:requires_ubuntu_amd64")


def parse_debian_version(value: str) -> tuple[int, ...]:
    match = re.search(r"(?<!\d)(\d+)\.(\d+)\.(\d+)\.(\d+)(?!\d)", value)
    if not match:
        raise SetupError("unknown_zoom_installation")
    return tuple(int(part) for part in match.groups())


def select_package_action(installed: str | None, receipt_owned: bool) -> str:
    if installed is None:
        return "install"
    current = parse_debian_version(installed)
    target = parse_debian_version(ZOOM_VERSION)
    if current > target:
        raise SetupError("downgrade_refused")
    if current == target:
        return "verify" if receipt_owned else "reinstall"
    if not receipt_owned:
        raise SetupError("unknown_conflicting_installation")
    return "upgrade"


def ensure_confined(path: pathlib.Path, root: pathlib.Path) -> None:
    root = root.resolve()
    candidate = path.absolute()
    if candidate != root and root not in candidate.parents:
        raise SetupError("path_outside_owned_root")
    current = root
    relative = candidate.relative_to(root)
    for part in relative.parts:
        current = current / part
        if current.is_symlink():
            raise SetupError("symlink_refused")


def atomic_write(path: pathlib.Path, content: bytes, mode: int = 0o600) -> None:
    ensure_confined(path, path.parent)
    path.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    if path.exists() and path.is_symlink():
        raise SetupError("symlink_refused")
    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{path.name}.", dir=path.parent
    )
    temporary = pathlib.Path(temporary_name)
    try:
        os.fchmod(descriptor, mode)
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(content)
            stream.flush()
            os.fsync(stream.fileno())
        temporary.replace(path)
        path.chmod(mode)
    finally:
        temporary.unlink(missing_ok=True)


def run_json(runner: Runner, argv: list[str]) -> dict[str, Any]:
    result = runner.run(argv)
    try:
        value = json.loads(result.stdout)
    except json.JSONDecodeError as error:
        raise SetupError(f"invalid_json:{pathlib.Path(argv[0]).name}") from error
    if not isinstance(value, dict):
        raise SetupError(f"invalid_json:{pathlib.Path(argv[0]).name}")
    return value


def session_records(value: dict[str, Any]) -> list[dict[str, Any]]:
    result = value.get("result", value)
    if isinstance(result, list):
        sessions = result
    else:
        sessions = result.get("sessions", []) if isinstance(result, dict) else []
    return [item for item in sessions if isinstance(item, dict)]


def xorg_result(value: dict[str, Any]) -> dict[str, Any]:
    result = value.get("result", value)
    return result if isinstance(result, dict) else {}


def render_camera_unit(display: str, xauthority: str) -> str:
    if not re.fullmatch(r":\d+(?:\.\d+)?", display):
        raise SetupError("invalid_display")
    if not pathlib.Path(xauthority).is_absolute() or any(
        character in xauthority for character in "\r\n"
    ):
        raise SetupError("invalid_xauthority")
    return (
        "[Unit]\n"
        "Description=xcsh terminal camera\n"
        "After=xorgctl-session@zoom-camera.service\n"
        "\n"
        "[Service]\n"
        f"Environment=DISPLAY={display}\n"
        f"Environment=XAUTHORITY={xauthority}\n"
        "ExecStartPre=\n"
        "ExecStart=\n"
        f"ExecStart=/usr/bin/ffmpeg -hide_banner -loglevel error -f x11grab -draw_mouse 0 "
        f"-framerate {FPS} -video_size {GEOMETRY} -i {display}+0,0 -vf format=yuv420p "
        f"-pix_fmt yuv420p -r {FPS} -s:v {GEOMETRY} -f v4l2 {CAMERA}\n"
        f"ExecStartPost=/usr/bin/v4l2-ctl --device={CAMERA} --set-parm={FPS}\n"
        "Restart=on-failure\nRestartSec=5\n"
    )


class Controller:
    def __init__(
        self, runner: Runner | None = None, home: pathlib.Path | None = None
    ) -> None:
        self.runner = runner or Runner()
        self.home = (home or pathlib.Path.home()).resolve()
        self.state = self.home / ".local/state/xcsh/zoom"
        self.receipt = self.state / "setup-receipt.json"
        self.dropin = (
            self.home
            / ".config/systemd/user/xcsh-camera.service.d/zoom-terminal-camera.conf"
        )
        self.gui_session = "console"
        self.session_dir = self.home / ".xcsh/agent/sessions"
        self.xorgctl = self.local_executable("xorgctl")
        self.herdr = self.local_executable("herdr")

    @property
    def profile(self) -> pathlib.Path:
        return self.home / ".config/ghostty/zoom-camera-red.conf"

    @property
    def zoom_config(self) -> pathlib.Path:
        return self.home / ".config/zoomus.conf"

    def local_executable(self, name: str) -> str:
        candidate = self.home / ".local" / "bin" / name
        return (
            str(candidate)
            if candidate.is_file() and not candidate.is_symlink()
            else name
        )

    def command_version(self, argv: list[str]) -> str:
        result = self.runner.run(argv, check=False)
        if result.returncode:
            raise SetupError(f"dependency_unavailable:{argv[0]}")
        return result.stdout.strip()

    def package_version(self) -> str | None:
        result = self.runner.run(
            ["dpkg-query", "-W", "-f=${Version}", "zoom"], check=False
        )
        return (
            result.stdout.strip()
            if result.returncode == 0 and result.stdout.strip()
            else None
        )

    def read_receipt(self) -> dict[str, Any] | None:
        if not self.receipt.is_file() or self.receipt.is_symlink():
            return None
        if stat.S_IMODE(self.receipt.stat().st_mode) != 0o600:
            return None
        try:
            value = json.loads(self.receipt.read_text())
        except (OSError, json.JSONDecodeError):
            return None
        return value if isinstance(value, dict) else None

    def dependencies(self) -> dict[str, str]:
        xorg = run_json(self.runner, [self.xorgctl, "--json", "capabilities"])
        xorg_version = str(xorg_result(xorg).get("version", ""))
        versions = {
            "xorg": xorg_version,
            "herdr": self.command_version([self.herdr, "--version"]),
            "ghostty": self.command_version(["ghostty", "--version"]),
            "xcsh": self.command_version(["xcsh", "--version"]),
        }
        if versions["xorg"] != "1.1.9" or "0.19.2" not in versions["herdr"]:
            raise SetupError("dependency_version_mismatch")
        return versions

    def ensure_zoom_package(self) -> str:
        installed = self.package_version()
        owned = (self.read_receipt() or {}).get("zoom_version") == installed
        action = select_package_action(installed, owned)
        if action == "verify":
            return action
        descriptor, name = tempfile.mkstemp(prefix="xcsh-zoom-", suffix=".deb")
        os.close(descriptor)
        package = pathlib.Path(name)
        try:
            self.runner.run(
                [
                    "curl",
                    "-fsSL",
                    "--retry",
                    "3",
                    "--connect-timeout",
                    "10",
                    "--max-time",
                    "300",
                    "--proto",
                    "=https",
                    ZOOM_URL,
                    "-o",
                    str(package),
                ]
            )
            if sha256_file(package) != ZOOM_SHA256:
                raise SetupError("package_digest_mismatch")
            self.runner.run(["sudo", "-n", "dpkg", "--install", str(package)])
        finally:
            package.unlink(missing_ok=True)
        observed = self.package_version()
        if observed is None or parse_debian_version(observed) != parse_debian_version(
            ZOOM_VERSION
        ):
            raise SetupError("package_verification_failed")
        return action

    def ensure_session(self) -> tuple[str, str, bool]:
        listed = run_json(
            self.runner,
            [self.xorgctl, "--session", SESSION, "--json", "session", "list"],
        )
        existing = next(
            (item for item in session_records(listed) if item.get("name") == SESSION),
            None,
        )
        created = existing is None
        if created:
            run_json(
                self.runner,
                [
                    self.xorgctl,
                    "--session",
                    SESSION,
                    "--json",
                    "session",
                    "create",
                    "--params",
                    json.dumps({"geometry": DESKTOP_GEOMETRY}),
                ],
            )
        status = xorg_result(
            run_json(
                self.runner,
                [self.xorgctl, "--session", SESSION, "--json", "session", "status"],
            )
        )
        environment = status.get("env", {})
        display = (
            str(environment.get("DISPLAY", "")) if isinstance(environment, dict) else ""
        )
        geometry = str(status.get("geometry", ""))
        xauthority = (
            str(environment.get("XAUTHORITY", ""))
            if isinstance(environment, dict)
            else ""
        )
        if (
            status.get("owned") is not True
            or geometry not in (GEOMETRY, DESKTOP_GEOMETRY)
            or not re.fullmatch(r":\d+(?:\.\d+)?", display)
        ):
            raise SetupError("xorg_session_not_ready")
        if not pathlib.Path(xauthority).is_absolute():
            raise SetupError("xorg_session_not_ready")
        return display, xauthority, created

    @staticmethod
    def confine(path: pathlib.Path, root: pathlib.Path) -> None:
        ensure_confined(path, root)

    @staticmethod
    def write(path: pathlib.Path, content: bytes) -> None:
        atomic_write(path, content)

    def ensure_ghostty_profile(self) -> bool:
        return CameraProfile(self).ensure()

    setup_error = SetupError

    def _hd_controller(self) -> ZoomHd:
        return ZoomHd(self)

    def hd_enabled(self) -> bool:
        return self._hd_controller().hd_enabled()

    def ensure_hd(self) -> dict[str, Any]:
        return self._hd_controller().ensure_hd()

    def ensure_herdr_window(self) -> tuple[bool, int]:
        sessions = run_json(self.runner, [self.herdr, "session", "list", "--json"])
        existing = next(
            (
                item
                for item in session_records(sessions)
                if item.get("name") == HERDR_SESSION
            ),
            None,
        )
        created = existing is None
        if existing is not None and existing.get("running") is not True:
            raise SetupError("herdr_session_not_running")
        if existing is not None:
            panes = run_json(
                self.runner, [self.herdr, "--session", HERDR_SESSION, "pane", "list"]
            )
            if "xcsh" not in json.dumps(panes).lower():
                raise SetupError("existing_xcsh_not_running")
        command = (
            [self.herdr, "--session", HERDR_SESSION]
            if created
            else [self.herdr, "session", "attach", HERDR_SESSION]
        )
        applications = xorg_result(
            run_json(
                self.runner,
                [self.xorgctl, "--session", SESSION, "--json", "app", "list"],
            )
        )
        windows = xorg_result(
            run_json(
                self.runner,
                [self.xorgctl, "--session", SESSION, "--json", "window", "list"],
            )
        )
        for app in applications.get("owned_processes", []):
            pid = app.get("pid")
            if not isinstance(pid, int) or app.get("running") is not True:
                continue
            args = self.runner.run(["ps", "-p", str(pid), "-o", "args="], check=False)
            try:
                argv = shlex.split(args.stdout)
            except ValueError:
                continue
            matches = all(
                value in argv
                for value in (
                    "--font-size=9",
                    "--gtk-single-instance=false",
                    f"--config-file={self.profile}",
                    "attach",
                    HERDR_SESSION,
                )
            )
            window: dict[str, Any] = next(
                (item for item in windows.get("windows", []) if item.get("pid") == pid),
                {},
            )
            if matches and all(
                window.get(key) == value
                for key, value in {"x": 0, "y": 0, "width": 1280, "height": 720}.items()
            ):
                return False, pid
        launch = xorg_result(
            run_json(
                self.runner,
                [
                    self.xorgctl,
                    "--session",
                    SESSION,
                    "--json",
                    "app",
                    "launch",
                    "--params",
                    json.dumps(
                        {
                            "argv": [
                                "ghostty",
                                "--gtk-single-instance=false",
                                "--font-size=9",
                                "--config-default-files=false",
                                f"--config-file={self.profile}",
                                "--window-decoration=false",
                                f"--working-directory={self.session_dir}",
                                "-e",
                                *command,
                            ]
                        }
                    ),
                ],
            )
        )
        pid = launch.get("pid")
        if not isinstance(pid, int):
            raise SetupError("ghostty_launch_failed")
        deadline = time.monotonic() + 10
        window_id = None
        while time.monotonic() < deadline:
            windows = xorg_result(
                run_json(
                    self.runner,
                    [self.xorgctl, "--session", SESSION, "--json", "window", "list"],
                )
            ).get("windows", [])
            window_id = next(
                (
                    item.get("id")
                    for item in windows
                    if isinstance(item, dict) and item.get("pid") == pid
                ),
                None,
            )
            if isinstance(window_id, int):
                break
            time.sleep(0.2)
        if not isinstance(window_id, int):
            raise SetupError("ghostty_window_timeout")
        run_json(
            self.runner,
            [
                self.xorgctl,
                "--session",
                SESSION,
                "--json",
                "window",
                "geometry",
                "--params",
                json.dumps(
                    {"window": window_id, "x": 0, "y": 0, "width": 1280, "height": 720}
                ),
            ],
        )
        if created:
            deadline = time.monotonic() + 15
            pane_id = None
            while time.monotonic() < deadline:
                panes = run_json(
                    self.runner,
                    [self.herdr, "--session", HERDR_SESSION, "pane", "list"],
                )
                records = xorg_result(panes).get("panes", [])
                pane_id = next(
                    (item.get("pane_id") for item in records if isinstance(item, dict)),
                    None,
                )
                if isinstance(pane_id, str):
                    break
                time.sleep(0.2)
            if not isinstance(pane_id, str):
                raise SetupError("herdr_session_creation_timeout")
            self.runner.run(
                [self.herdr, "--session", HERDR_SESSION, "pane", "run", pane_id, "xcsh"]
            )
        return created, pid

    def write_managed_files(
        self, display: str, xauthority: str, receipt: dict[str, Any]
    ) -> None:
        ensure_confined(self.dropin, self.home)
        ensure_confined(self.receipt, self.home)
        atomic_write(self.dropin, render_camera_unit(display, xauthority).encode())
        atomic_write(
            self.receipt,
            (
                json.dumps(receipt, sort_keys=True, separators=(",", ":")) + "\n"
            ).encode(),
        )

    def _verification(self) -> CameraVerification:
        return CameraVerification(self, render_camera_unit, xorg_result)

    def producer_matches(self, display: str, pid: int | None) -> bool:
        return self._verification().producer_matches(display, pid)

    def camera_live(self, display: str) -> bool:
        return self._verification().camera_live(display)

    def reconcile_override(self, display: str, xauthority: str) -> bool:
        return self._verification().reconcile_override(display, xauthority)

    def window_matches(self, pid: int | None) -> bool:
        return self._verification().window_matches(pid)

    def status(self) -> dict[str, Any]:
        receipt = self.read_receipt()
        package = self.package_version()
        service = self.runner.run(
            ["systemctl", "--user", "is-active", "xcsh-camera.service"], check=False
        )
        fmt = self.runner.run(
            [
                "v4l2-ctl",
                f"--device={CAMERA}",
                "--get-fmt-video-out",
                "--get-output-parm",
            ],
            check=False,
        )
        producer = self.runner.run(
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
        session = self.runner.run(
            [self.xorgctl, "--session", SESSION, "--json", "session", "status"],
            check=False,
        )
        applications = self.runner.run(
            [self.xorgctl, "--session", SESSION, "--json", "app", "list"], check=False
        )
        herdr_sessions = self.runner.run(
            [self.herdr, "session", "list", "--json"], check=False
        )
        herdr_panes = self.runner.run(
            [self.herdr, "--session", HERDR_SESSION, "pane", "list"], check=False
        )
        try:
            session_state = (
                xorg_result(json.loads(session.stdout))
                if session.returncode == 0
                else {}
            )
            owned = (
                xorg_result(json.loads(applications.stdout)).get("owned_processes", [])
                if applications.returncode == 0
                else []
            )
        except json.JSONDecodeError:
            session_state, owned = {}, []
        receipt_pid = receipt.get("ghostty_pid") if receipt else None
        ghostty_owned = any(
            isinstance(item, dict)
            and item.get("pid") == receipt_pid
            and item.get("running") is True
            for item in owned
        )
        try:
            herdr_running = any(
                item.get("name") == HERDR_SESSION and item.get("running") is True
                for item in session_records(json.loads(herdr_sessions.stdout))
            )
            xcsh_present = "xcsh" in herdr_panes.stdout.lower()
        except json.JSONDecodeError:
            herdr_running, xcsh_present = False, False
        environment = session_state.get("env", {})
        display = environment.get("DISPLAY") if isinstance(environment, dict) else None
        ready = bool(
            receipt
            and receipt.get("plugin_version") == PLUGIN_VERSION
            and receipt.get("zoom_version") == ZOOM_VERSION
            and receipt.get("camera_label") == CAMERA_LABEL
            and receipt.get("geometry") == GEOMETRY
            and isinstance(display, str)
            and bool(re.fullmatch(r":\d+(?:\.\d+)?", display))
            and display == receipt.get("display")
            and session_state.get("geometry") in (GEOMETRY, DESKTOP_GEOMETRY)
            and receipt.get("desktop_geometry") == session_state.get("geometry")
            and isinstance(environment.get("XAUTHORITY"), str)
            and pathlib.Path(environment["XAUTHORITY"]).is_absolute()
            and not any(value in environment["XAUTHORITY"] for value in "\r\n")
            and receipt.get("fps") == FPS
            and receipt.get("font_size") == 9
            and receipt.get("unit_sha256")
            == hashlib.sha256(
                render_camera_unit(
                    display, str(environment.get("XAUTHORITY", ""))
                ).encode()
            ).hexdigest()
            and receipt.get("profile_sha256")
            == (sha256_file(self.profile) if self.profile.is_file() else None)
            and self.hd_enabled()
            and ghostty_owned
            and self.window_matches(receipt_pid)
            and self.dropin.is_file()
            and isinstance(receipt.get("xauthority"), str)
            and pathlib.Path(receipt["xauthority"]).is_absolute()
            and not any(value in receipt["xauthority"] for value in "\r\n")
            and self.dropin.read_text()
            == render_camera_unit(display, receipt["xauthority"])
            and not (self.dropin.parent / "zz-720-fps-comparison.conf").exists()
            and self.producer_matches(
                display,
                int(producer.stdout.strip())
                if producer.stdout.strip().isdigit()
                else None,
            )
            and herdr_running
            and xcsh_present
            and service.stdout.strip() == "active"
            and re.search(r"Width/Height\s*:\s*1280/720\b", fmt.stdout)
            and re.search(r"Frames per second:\s*15(?:\.0+)?\b", fmt.stdout)
            and ("YU12" in fmt.stdout or "YUV420" in fmt.stdout)
            and producer.stdout.strip().isdigit()
            and producer.stdout.strip() != "0"
        )
        return {
            "ready": ready,
            "plugin_version": PLUGIN_VERSION,
            "zoom_version": package,
            "session": SESSION,
            "geometry": GEOMETRY,
            "desktop_geometry": session_state.get("geometry"),
            "font_size": 9,
            "hd": self.hd_enabled(),
            "herdr_session": HERDR_SESSION,
            "camera": CAMERA,
            "camera_label": CAMERA_LABEL,
            "format": "yuv420p",
            "fps": FPS,
            "producer_pid": int(producer.stdout.strip())
            if producer.stdout.strip().isdigit()
            else None,
            "process_chain": {
                "ghostty_owned": ghostty_owned,
                "herdr_running": herdr_running,
                "xcsh_present": xcsh_present,
            },
            "receipt": receipt,
        }

    def ensure_camera_device(self) -> None:
        self.runner.run(["systemctl", "--user", "stop", "xcsh-camera.service"])
        fmt = self.runner.run(
            [
                "v4l2-ctl",
                f"--device={CAMERA}",
                "--get-fmt-video-out",
                "--get-output-parm",
            ],
            check=False,
        )
        if fmt.returncode == 0:
            return
        try:
            label = (
                pathlib.Path("/sys/class/video4linux/video10/name").read_text().strip()
            )
            numbers = pathlib.Path(
                "/sys/module/v4l2loopback/parameters/video_nr"
            ).read_text()
            devices = sorted(
                int(value) for value in numbers.strip().split(",") if int(value) >= 0
            )
        except (OSError, ValueError) as error:
            raise SetupError("camera_recovery_ownership_unknown") from error
        if label != CAMERA_LABEL or devices != [10]:
            raise SetupError("camera_recovery_foreign_device")
        users = self.runner.run(["fuser", CAMERA], check=False)
        if users.returncode != 1:
            raise SetupError("camera_recovery_device_busy_or_unknown")
        self.runner.run(["sudo", "-n", "modprobe", "-r", "v4l2loopback"])
        self.runner.run(
            [
                "sudo",
                "-n",
                "modprobe",
                "v4l2loopback",
                "video_nr=10",
                f"card_label={CAMERA_LABEL}",
                "exclusive_caps=1",
            ]
        )

    def await_ready(self) -> dict[str, Any]:
        deadline = time.monotonic() + 30
        while True:
            result = self.status()
            if result["ready"] or time.monotonic() >= deadline:
                return result
            time.sleep(0.2)

    def _camera_receipt(
        self,
        display: str,
        xauthority: str,
        ghostty_pid: int,
        herdr_created: bool,
        dependencies: dict[str, str],
    ) -> dict[str, Any]:
        return {
            "schema_version": 1,
            "plugin_version": PLUGIN_VERSION,
            "zoom_version": ZOOM_VERSION,
            "zoom_url": ZOOM_URL,
            "zoom_sha256": ZOOM_SHA256,
            "session": SESSION,
            "display": display,
            "xauthority": xauthority,
            "geometry": GEOMETRY,
            "desktop_geometry": xorg_result(
                run_json(
                    self.runner,
                    [
                        self.xorgctl,
                        "--session",
                        SESSION,
                        "--json",
                        "session",
                        "status",
                    ],
                )
            ).get("geometry"),
            "font_size": 9,
            "profile_sha256": sha256_file(self.profile),
            "herdr_session": HERDR_SESSION,
            "herdr_created": herdr_created,
            "ghostty_pid": ghostty_pid,
            "camera": CAMERA,
            "camera_label": CAMERA_LABEL,
            "format": "yuv420p",
            "fps": FPS,
            "dependencies": dependencies,
            "unit_sha256": hashlib.sha256(
                render_camera_unit(display, xauthority).encode()
            ).hexdigest(),
        }

    def _rollback(
        self,
        previous: dict[str, bytes | None],
        experimental: pathlib.Path,
        ghostty_pid: int | None,
        launched_ghostty: bool,
        session_created: bool,
        herdr_created: bool,
    ) -> None:
        if previous["profile"] is None:
            self.profile.unlink(missing_ok=True)
        else:
            atomic_write(self.profile, previous["profile"])
        if previous["experiment"] is not None:
            atomic_write(experimental, previous["experiment"])
        if ghostty_pid is not None and not session_created and launched_ghostty:
            self.runner.run(
                [
                    self.xorgctl,
                    "--session",
                    SESSION,
                    "--json",
                    "app",
                    "close",
                    "--params",
                    json.dumps({"pid": ghostty_pid}),
                ],
                check=False,
            )
        if session_created:
            self.runner.run(
                [self.xorgctl, "--session", SESSION, "--json", "session", "remove"],
                check=False,
            )
        if herdr_created:
            self.runner.run(
                [self.herdr, "session", "stop", HERDR_SESSION, "--json"],
                check=False,
            )
            self.runner.run(
                [self.herdr, "session", "delete", HERDR_SESSION, "--json"],
                check=False,
            )
        if previous["dropin"] is None:
            self.dropin.unlink(missing_ok=True)
        else:
            atomic_write(self.dropin, previous["dropin"])
        if previous["receipt"] is None:
            self.receipt.unlink(missing_ok=True)
        else:
            atomic_write(self.receipt, previous["receipt"])
        self.runner.run(["systemctl", "--user", "daemon-reload"], check=False)
        self.runner.run(
            ["systemctl", "--user", "restart", "xcsh-camera.service"], check=False
        )

    def apply(self) -> dict[str, Any]:
        require_platform()
        self.state.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.session_dir.mkdir(parents=True, exist_ok=True, mode=0o700)
        dependencies = self.dependencies()
        hd = self.ensure_hd()
        current = self.status()
        if current["ready"]:
            return {**current, "changed": hd["changed"]}
        package_action = self.ensure_zoom_package()
        previous = {
            "profile": self.profile.read_bytes() if self.profile.is_file() else None,
            "dropin": self.dropin.read_bytes() if self.dropin.is_file() else None,
            "receipt": self.receipt.read_bytes() if self.receipt.is_file() else None,
            "experiment": None,
        }
        session_created = False
        herdr_created = False
        ghostty_pid: int | None = None
        launched_ghostty = False
        experimental = self.dropin.parent / "zz-720-fps-comparison.conf"
        try:
            self.ensure_ghostty_profile()
            display, xauthority, session_created = self.ensure_session()
            reuse_producer = self.camera_live(display)
            if not reuse_producer:
                self.ensure_camera_device()
            old_apps = xorg_result(
                run_json(
                    self.runner,
                    [self.xorgctl, "--session", SESSION, "--json", "app", "list"],
                )
            )
            old_pids = {
                item.get("pid")
                for item in old_apps.get("owned_processes", [])
                if item.get("running")
            }
            herdr_created, ghostty_pid = self.ensure_herdr_window()
            launched_ghostty = ghostty_pid not in old_pids
            receipt = self._camera_receipt(
                display, xauthority, ghostty_pid, herdr_created, dependencies
            )
            previous["experiment"] = (
                experimental.read_bytes() if experimental.is_file() else None
            )
            self.reconcile_override(display, xauthority)
            self.write_managed_files(display, xauthority, receipt)
            self.runner.run(["systemctl", "--user", "daemon-reload"])
            if not reuse_producer:
                self.runner.run(
                    ["systemctl", "--user", "restart", "xcsh-camera.service"]
                )
            result = self.await_ready()
            if not result["ready"]:
                raise SetupError("readiness_failed")
            return {
                **result,
                "changed": True,
                "package_action": package_action,
                "session_created": session_created,
                "herdr_created": herdr_created,
            }
        except Exception:
            self._rollback(
                previous,
                experimental,
                ghostty_pid,
                launched_ghostty,
                session_created,
                herdr_created,
            )
            raise


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=("apply", "verify", "status", "hd"))
    parser.add_argument("--json", action="store_true")
    parser.add_argument("--session", default="console")
    args = parser.parse_args()
    try:
        controller = Controller()
        controller.gui_session = args.session
        result = (
            controller.ensure_hd()
            if args.action == "hd"
            else (controller.apply() if args.action == "apply" else controller.status())
        )
        if args.action == "hd":
            print(json.dumps(result, sort_keys=True))
            return 0
        if args.action == "verify" and not result["ready"]:
            raise SetupError("setup_incomplete")
        print(
            json.dumps(result, sort_keys=True)
            if args.json
            else ("ready" if result["ready"] else "not ready")
        )
        return 0 if result["ready"] else 1
    except SetupError as error:
        value = {"ready": False, "error": str(error)}
        print(
            json.dumps(value, sort_keys=True)
            if args.json
            else f"zoom_setup_error:{error}",
            file=sys.stderr,
        )
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
