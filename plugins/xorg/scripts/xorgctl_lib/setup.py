"""Idempotent Ubuntu 24.04 setup and readiness reporting for xorgctl."""

from __future__ import annotations

import importlib.util
import json
import pathlib
import shutil
import subprocess
import sys
import time

from .common import ROOT, VERSION, Fault, rpc

UBUNTU_ID = "ubuntu"
UBUNTU_VERSION = "24.04"
REQUIRED_COMMANDS = (
    "ffmpeg",
    "fc-match",
    "pactl",
    "tesseract",
    "v4l2-ctl",
    "wmctrl",
    "xauth",
    "xdotool",
    "xdpyinfo",
    "xvfb-run",
)
REQUIRED_MODULES = ("PIL", "PyQt6", "Xlib", "gi", "keyring")
APT_PACKAGES = (
    "ffmpeg",
    "fontconfig",
    "fonts-crosextra-caladea",
    "fonts-crosextra-carlito",
    "fonts-liberation",
    "fonts-noto-cjk",
    "fonts-noto-color-emoji",
    "fonts-noto-core",
    "libxcb-cursor0",
    "mesa-utils",
    "openbox",
    "pulseaudio-utils",
    "python3-keyring",
    "python3-pil",
    "python3-pyatspi",
    "python3-pyqt6",
    "python3-venv",
    "python3-xlib",
    "tesseract-ocr",
    "v4l-utils",
    "vulkan-tools",
    "wmctrl",
    "x11-utils",
    "x11-xserver-utils",
    "xauth",
    "xdotool",
    "xvfb",
)
PINNED_PYTHON = (
    "numpy==2.2.6",
    "opencv-python-headless==4.12.0.88",
    "piper-tts==1.8.0",
    "playwright==1.55.0",
)


def _platform() -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        for line in pathlib.Path("/etc/os-release").read_text().splitlines():
            key, separator, value = line.partition("=")
            if separator:
                values[key] = value.strip().strip('"')
    except FileNotFoundError:
        pass
    return {
        "id": values.get("ID", "unknown"),
        "version_id": values.get("VERSION_ID", "unknown"),
    }


def _command(
    argv: list[str],
    *,
    check: bool = False,
    timeout: int = 30,
) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(
        argv,
        text=True,
        capture_output=True,
        check=False,
        timeout=timeout,
    )
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip()[-1000:]
        msg = f"{argv[0]} exited {result.returncode}: {detail}"
        raise Fault(msg)
    return result


def _service_active(name: str) -> bool:
    return (
        _command(["systemctl", "--user", "is-active", "--quiet", name]).returncode == 0
    )


def _session_service(name: str) -> str:
    return f"xorgctl-session@{name}.service"


def _worker_version(name: str) -> str | None:
    try:
        value = rpc(name, "status", {}).get("version")
        return str(value) if value is not None else None
    except (Fault, OSError, EOFError):
        return None


def status(expected_version: str) -> dict[str, object]:
    platform = _platform()
    command_checks = {
        name: shutil.which(name) is not None for name in REQUIRED_COMMANDS
    }
    module_checks = {
        name: importlib.util.find_spec(name) is not None for name in REQUIRED_MODULES
    }
    camera = pathlib.Path("/dev/video10")
    camera_label = pathlib.Path("/sys/class/video4linux/video10/name")
    camera_ready = (
        camera.exists()
        and camera_label.is_file()
        and camera_label.read_text().strip() == "xcsh Camera"
    )
    font = _command(["fc-match", "-f", "%{family[0]}", "JetBrainsMono Nerd Font"])
    worker_version = _worker_version("console")
    checks: dict[str, object] = {
        "platform": platform == {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION},
        "version": expected_version == VERSION,
        "commands": command_checks,
        "python_modules": module_checks,
        "virtual_camera": {
            "ready": camera_ready,
            "device": "/dev/video10",
            "label": "xcsh Camera",
        },
        "fonts": {
            "ready": font.returncode == 0 and "JetBrainsMono Nerd Font" in font.stdout
        },
        "services": {
            "console": _service_active(_session_service("console")),
            "camera": _service_active("xcsh-camera.service"),
        },
        "worker": {"ready": worker_version == VERSION, "version": worker_version},
    }
    missing: list[str] = []
    if not checks["platform"]:
        missing.append("ubuntu_24_04")
    if not checks["version"]:
        missing.append("version")
    missing.extend(
        f"command:{name}" for name, ready in command_checks.items() if not ready
    )
    missing.extend(
        f"python_module:{name}" for name, ready in module_checks.items() if not ready
    )
    if not camera_ready:
        missing.append("virtual_camera")
    if not checks["fonts"]["ready"]:  # type: ignore[index]
        missing.append("fonts")
    missing.extend(
        f"service:{name}" for name, ready in checks["services"].items() if not ready
    )  # type: ignore[union-attr]
    if worker_version != VERSION:
        missing.append("worker_version")
    return {
        "state": "ready" if not missing else "degraded",
        "version": VERSION,
        "expected_version": expected_version,
        "platform": platform,
        "checks": checks,
        "missing": missing,
    }


def _install_launcher(interpreter: pathlib.Path) -> None:
    source = pathlib.Path(__file__).resolve().parents[1] / "xorgctl"
    destination = pathlib.Path.home() / ".local/bin/xorgctl"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(f'#!/bin/sh\nexec {interpreter} {source} "$@"\n')
    temporary.chmod(0o755)
    temporary.replace(destination)


def _install_session_service() -> None:
    destination = pathlib.Path.home() / ".config/systemd/user/xorgctl-session@.service"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(
        "[Unit]\nDescription=xorgctl session %i\nAfter=graphical-session.target\n\n"
        "[Service]\nType=simple\nExecStart=%h/.local/bin/xorgctl _service %i\n"
        "Restart=on-failure\nRestartSec=2\n\n[Install]\nWantedBy=default.target\n"
    )
    temporary.chmod(0o644)
    temporary.replace(destination)


def apply(expected_version: str) -> dict[str, object]:
    platform = _platform()
    if platform != {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION}:
        msg = "xorgctl setup supports Ubuntu 24.04 only"
        raise Fault(msg)
    if expected_version != VERSION:
        msg = f"requested Xorg version {expected_version} does not match installed {VERSION}"
        raise Fault(msg)
    _command(
        [
            "sudo",
            "-n",
            "env",
            "DEBIAN_FRONTEND=noninteractive",
            "apt-get",
            "install",
            "-y",
            *APT_PACKAGES,
        ],
        check=True,
        timeout=300,
    )
    venv = pathlib.Path.home() / ".local/share/xorgctl/venv"
    _command(
        [sys.executable, "-m", "venv", "--system-site-packages", str(venv)],
        check=True,
        timeout=120,
    )
    _command(
        [str(venv / "bin/pip"), "install", *PINNED_PYTHON], check=True, timeout=300
    )
    _install_launcher(venv / "bin/python")
    _install_session_service()
    if not (ROOT / "console/session.json").is_file():
        from .sessions import manage as manage_session

        manage_session("console", "attach", {})
    _command(["systemctl", "--user", "daemon-reload"], check=True)
    _command(
        ["systemctl", "--user", "enable", "--now", _session_service("console")],
        check=True,
    )
    _command(
        ["systemctl", "--user", "restart", _session_service("console")], check=True
    )
    deadline = time.monotonic() + 15
    while _worker_version("console") != VERSION and time.monotonic() < deadline:
        time.sleep(0.1)
    # Device and user services are deliberately reconciled by their dedicated
    # installer package. Setup reports degraded until they are active; it never
    # substitutes physical camera or audio devices.
    result = status(expected_version)
    state = pathlib.Path.home() / ".local/state/xorgctl/setup.json"
    state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = state.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True))
    temporary.chmod(0o600)
    temporary.replace(state)
    return result


def manage(action: str, params: dict[str, object]) -> dict[str, object]:
    expected = str(params.get("expected_version", VERSION))
    if action == "status":
        return status(expected)
    if action == "apply":
        return apply(expected)
    msg = "unknown setup operation"
    raise Fault(msg)
