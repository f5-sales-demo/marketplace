"""Idempotent, self-contained Ubuntu 24.04 setup for xorgctl."""

from __future__ import annotations

import hashlib
import importlib.util
import json
import os
import pathlib
import re
import shutil
import subprocess
import sys
import tarfile
import tempfile
import time

from .common import ROOT, VERSION, Fault, rpc
from .sessions import manage as manage_session

UBUNTU_ID = "ubuntu"
UBUNTU_VERSION = "24.04"
NERD_FONTS_VERSION = "3.5.1"
NERD_FONTS_SHA256 = "04d5e8f903693f9dd13e16f867e994834e681eb3c72c0d337a770dcda09010cf"
NERD_FONTS_URL = f"https://github.com/ryanoasis/nerd-fonts/releases/download/v{NERD_FONTS_VERSION}/JetBrainsMono.tar.xz"
VIRTUALGL_VERSION = "3.1.4"
VIRTUALGL_SHA256 = "02edc6b599571c385389af1a006f07a70c298e1d97c580a9bfd4b39d835c51e6"
VIRTUALGL_URL = "https://github.com/VirtualGL/virtualgl/releases/download/3.1.4/virtualgl_3.1.4_amd64.deb"
REQUIRED_COMMANDS = (
    "ffmpeg", "fc-match", "pactl", "tesseract", "v4l2-ctl", "wmctrl",
    "xauth", "xdotool", "xdpyinfo", "xvfb-run",
)
REQUIRED_MODULES = ("PIL", "PyQt6", "Xlib", "gi", "keyring")
APT_PACKAGES = (
    "curl", "dbus-x11", "ffmpeg", "fontconfig", "fonts-crosextra-caladea",
    "fonts-crosextra-carlito", "fonts-liberation", "fonts-noto-cjk",
    "fonts-noto-color-emoji", "fonts-noto-core", "kmod", "libxcb-cursor0",
    "mesa-utils", "openbox", "pipewire-pulse", "pulseaudio-utils",
    "python3-keyring", "python3-pil", "python3-pyatspi", "python3-pyqt6",
    "python3-venv", "python3-xlib", "tesseract-ocr", "v4l-utils",
    "v4l2loopback-dkms", "vulkan-tools", "wmctrl", "x11-utils",
    "x11-xserver-utils", "x11vnc", "xauth", "xdotool", "xvfb",
)
PINNED_PYTHON = (
    "numpy==2.2.6", "opencv-python-headless==4.12.0.88",
    "piper-tts==1.8.0", "playwright==1.55.0",
)


def _platform() -> dict[str, str]:
    values: dict[str, str] = {}
    try:
        for line in pathlib.Path("/etc/os-release").read_text().splitlines():
            key, separator, value = line.partition("=")
            if separator:
                values[key] = value.strip().strip('"')
    except OSError:
        pass
    return {"id": values.get("ID", "unknown"), "version_id": values.get("VERSION_ID", "unknown")}


def _command(argv: list[str], *, check: bool = False, timeout: int = 30, env=None) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(argv, text=True, capture_output=True, check=False, timeout=timeout, env=env)
    except FileNotFoundError as error:
        if check:
            raise Fault(f"command not found: {argv[0]}") from error
        return subprocess.CompletedProcess(argv, 127, "", "command not found")
    except subprocess.TimeoutExpired as error:
        raise Fault(f"{argv[0]} timed out after {timeout}s") from error
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip()[-1000:]
        raise Fault(f"{argv[0]} exited {result.returncode}: {detail}")
    return result


def _service_active(name: str) -> bool:
    return shutil.which("systemctl") is not None and _command(["systemctl", "--user", "is-active", "--quiet", name]).returncode == 0


def _session_service(name: str) -> str:
    return f"xorgctl-session@{name}.service"


def _worker_version(name: str) -> str | None:
    try:
        value = rpc(name, "status", {}).get("version")
        return str(value) if value is not None else None
    except (Fault, OSError, EOFError):
        return None


def _session_config(name: str) -> dict[str, object]:
    try:
        value = json.loads((ROOT / name / "session.json").read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _configured_session_names() -> list[str]:
    try:
        return sorted(path.parent.name for path in ROOT.glob("*/session.json") if path.is_file())
    except OSError:
        return []


def session_worker_checks() -> dict[str, dict[str, object]]:
    checks: dict[str, dict[str, object]] = {}
    for name in _configured_session_names():
        if not _service_active(_session_service(name)):
            continue
        version = _worker_version(name)
        checks[name] = {"ready": version == VERSION, "version": version}
    return checks


def _dependency_checks() -> dict[str, object]:
    commands = {name: shutil.which(name) is not None for name in REQUIRED_COMMANDS}
    modules = {name: importlib.util.find_spec(name) is not None for name in REQUIRED_MODULES}
    return {"ready": all(commands.values()) and all(modules.values()), "commands": commands, "python_modules": modules}


def _font_status() -> dict[str, object]:
    if shutil.which("fc-match") is None:
        return {"ready": False, "version": NERD_FONTS_VERSION}
    result = _command(["fc-match", "-f", "%{family[0]}", "JetBrainsMono Nerd Font"])
    return {"ready": result.returncode == 0 and "JetBrainsMono Nerd Font" in result.stdout, "version": NERD_FONTS_VERSION}


def _camera_status() -> dict[str, object]:
    label = pathlib.Path("/sys/class/video4linux/video10/name")
    ready = pathlib.Path("/dev/video10").exists() and label.is_file() and label.read_text().strip() == "xcsh Camera"
    return {"ready": ready, "device": "/dev/video10", "label": "xcsh Camera"}


def _audio_status() -> dict[str, object]:
    config = _session_config("console")
    sink = str(config.get("audio_sink", ""))
    source = str(config.get("audio_source", ""))
    ready = sink == "xorgctl_console" and source == "xcsh_microphone_input"
    return {"ready": ready, "sink": sink or None, "source": "xcsh Microphone" if ready else None}


def _gpu_status() -> dict[str, object]:
    if shutil.which("nvidia-smi") is None:
        return {"detected": False, "required": False, "ready": True, "renderer": "native"}
    config = _session_config("console")
    env = {**os.environ, **dict(config.get("env", {}))}
    vglrun = pathlib.Path("/opt/VirtualGL/bin/vglrun")
    result = _command([str(vglrun), "-d", "egl0", "glxinfo", "-B"], env=env, timeout=30) if vglrun.is_file() else None
    ready = bool(result and result.returncode == 0 and "NVIDIA" in result.stdout)
    return {"detected": True, "required": True, "ready": ready, "renderer": "virtualgl-egl"}


def _console_plan() -> tuple[str, dict[str, str], str]:
    auth = pathlib.Path(f"/run/user/{os.getuid()}/gdm/Xauthority")
    if auth.is_file():
        result = _command(["xdpyinfo"], env={**os.environ, "DISPLAY": ":0", "XAUTHORITY": str(auth)})
        if result.returncode == 0:
            return "attach", {"display": ":0", "auth": str(auth)}, "attached_xorg"
    return "create", {"geometry": "1920x1080"}, "headless_xvfb"


def _download_verified(url: str, expected: str, destination: pathlib.Path) -> None:
    _command(["curl", "--proto", "=https", "--tlsv1.2", "--fail", "--location", "--silent", "--show-error", "-o", str(destination), url], check=True, timeout=300)
    if hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        raise Fault(f"download checksum mismatch for {destination.name}")


def _install_packages() -> None:
    _command(["sudo", "-n", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "install", "-y", *APT_PACKAGES], check=True, timeout=600)


def _install_python() -> pathlib.Path:
    venv = pathlib.Path.home() / ".local/share/xorgctl/venv"
    _command([sys.executable, "-m", "venv", "--system-site-packages", str(venv)], check=True, timeout=120)
    _command([str(venv / "bin/pip"), "install", *PINNED_PYTHON], check=True, timeout=600)
    return venv / "bin/python"


def _install_fonts() -> None:
    destination = pathlib.Path.home() / ".local/share/fonts/xorgctl/JetBrainsMonoNerdFont"
    with tempfile.TemporaryDirectory(prefix="xorgctl-fonts-") as directory:
        archive = pathlib.Path(directory) / "JetBrainsMono.tar.xz"
        extracted = pathlib.Path(directory) / "fonts"
        extracted.mkdir()
        _download_verified(NERD_FONTS_URL, NERD_FONTS_SHA256, archive)
        with tarfile.open(archive, "r:xz") as bundle:
            members = [item for item in bundle.getmembers() if item.isfile() and re.fullmatch(r"JetBrainsMonoNerdFont-[A-Za-z]+\.ttf", pathlib.PurePosixPath(item.name).name)]
            if len(members) != 16:
                raise Fault(f"expected 16 JetBrains Mono faces, found {len(members)}")
            for member in members:
                source = bundle.extractfile(member)
                if source is None:
                    raise Fault("font archive member could not be read")
                target = extracted / pathlib.PurePosixPath(member.name).name
                target.write_bytes(source.read())
                target.chmod(0o644)
        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(extracted, destination)
    config = pathlib.Path.home() / ".config/fontconfig/conf.d/50-xorgctl-rendering.conf"
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text('<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><alias><family>monospace</family><prefer><family>JetBrainsMono Nerd Font</family></prefer></alias><alias><family>sans-serif</family><prefer><family>Liberation Sans</family></prefer></alias><alias><family>serif</family><prefer><family>Liberation Serif</family></prefer></alias></fontconfig>\n')
    config.chmod(0o644)
    _command(["fc-cache", "-f"], check=True, timeout=120)


def _install_virtualgl() -> None:
    if shutil.which("nvidia-smi") is None or pathlib.Path("/opt/VirtualGL/bin/vglrun").is_file():
        return
    if os.uname().machine not in ("x86_64", "amd64"):
        raise Fault("NVIDIA VirtualGL setup is not published for this architecture")
    with tempfile.TemporaryDirectory(prefix="xorgctl-virtualgl-") as directory:
        package = pathlib.Path(directory) / "virtualgl.deb"
        _download_verified(VIRTUALGL_URL, VIRTUALGL_SHA256, package)
        _command(["sudo", "-n", "dpkg", "-i", str(package)], check=True, timeout=300)


def _install_root_file(destination: str, content: str) -> None:
    with tempfile.NamedTemporaryFile("w", prefix="xorgctl-", delete=False) as stream:
        stream.write(content)
        temporary = pathlib.Path(stream.name)
    try:
        _command(["sudo", "-n", "install", "-D", "-m", "0644", str(temporary), destination], check=True)
    finally:
        temporary.unlink(missing_ok=True)


def _install_services() -> None:
    user = _command(["id", "-un"], check=True).stdout.strip()
    _install_root_file("/etc/modules-load.d/xcsh-camera.conf", "v4l2loopback\n")
    _install_root_file("/etc/modprobe.d/xcsh-camera.conf", 'options v4l2loopback video_nr=10 card_label="xcsh Camera" exclusive_caps=1\n')
    _install_root_file("/etc/udev/rules.d/99-xcsh-camera.rules", f'KERNEL=="video10", SUBSYSTEM=="video4linux", OWNER="{user}", GROUP="video", MODE="0660"\n')
    systemd = pathlib.Path.home() / ".config/systemd/user"
    systemd.mkdir(parents=True, exist_ok=True)
    (systemd / "xorgctl-session@.service").write_text("[Unit]\nDescription=xorgctl session %i\nAfter=default.target\n\n[Service]\nType=simple\nExecStart=%h/.local/bin/xorgctl _service %i\nRestart=on-failure\nRestartSec=2\nKillMode=control-group\nUMask=0077\n\n[Install]\nWantedBy=default.target\n")
    (systemd / "xcsh-camera.service").write_text("[Unit]\nDescription=xcsh virtual camera\nAfter=default.target\nConditionPathExists=/dev/video10\n\n[Service]\nExecStart=/usr/bin/ffmpeg -hide_banner -loglevel error -re -f lavfi -i testsrc2=size=1280x720:rate=30 -vf drawtext=text=xcsh\\ Camera:x=(w-text_w)/2:y=(h-text_h)/2:fontsize=72:fontcolor=white:box=1:boxcolor=black@0.65 -f v4l2 -pix_fmt yuv420p /dev/video10\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n")
    for path in systemd.glob("*.service"):
        path.chmod(0o644)
    _command(["sudo", "-n", "loginctl", "enable-linger", user], check=True)
    _command(["systemctl", "--user", "daemon-reload"], check=True)


def _ensure_virtual_media() -> None:
    if not _camera_status()["ready"]:
        if pathlib.Path("/sys/module/v4l2loopback").exists():
            raise Fault("v4l2loopback is active without the required /dev/video10 xcsh Camera; refusing to reset an in-use module")
        _command(["sudo", "-n", "modprobe", "v4l2loopback", "video_nr=10", "card_label=xcsh Camera", "exclusive_caps=1"], check=True)
        _command(["sudo", "-n", "udevadm", "control", "--reload-rules"], check=True)
        _command(["sudo", "-n", "udevadm", "trigger", "--name-match=video10"], check=True)
    _command(["systemctl", "--user", "enable", "--now", "xcsh-camera.service"], check=True)
    rpc("console", "audio.create", {})


def status(expected_version: str) -> dict[str, object]:
    platform = _platform()
    dependencies = _dependency_checks()
    font = _font_status()
    camera = _camera_status()
    audio = _audio_status()
    gpu = _gpu_status()
    workers = session_worker_checks()
    worker = workers.get("console", {"ready": False, "version": None})
    config = _session_config("console")
    session_mode = "headless_xvfb" if config.get("owned") is True else "attached_xorg" if config else "unconfigured"
    services = {"console": _service_active(_session_service("console")), "camera": _service_active("xcsh-camera.service")}
    checks: dict[str, object] = {"platform": platform == {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION}, "version": expected_version == VERSION, "commands": dependencies["commands"], "python_modules": dependencies["python_modules"], "virtual_camera": camera, "fonts": font, "services": services, "worker": worker, "session_workers": workers}
    ready = bool(checks["platform"] and checks["version"] and dependencies["ready"] and font["ready"] and camera["ready"] and audio["ready"] and gpu["ready"] and all(services.values()) and worker["ready"])
    missing: list[str] = []
    if not dependencies["ready"]: missing.append("dependencies")
    if not font["ready"]: missing.append("fonts")
    if not camera["ready"]: missing.append("virtual_camera")
    if not audio["ready"]: missing.append("virtual_audio")
    if not gpu["ready"]: missing.append("gpu_renderer")
    missing.extend(f"service:{name}" for name, value in services.items() if not value)
    if not worker["ready"]: missing.append("worker_version")
    return {"state": "ready" if ready else "degraded", "version": VERSION, "expected_version": expected_version, "platform": platform, "session_mode": session_mode, "dependencies": dependencies, "services": services, "virtual_devices": {"camera": camera, "audio": audio}, "gpu_renderer": gpu, "checks": checks, "missing": missing}


def _install_launcher(interpreter: pathlib.Path) -> None:
    source = pathlib.Path(__file__).resolve().parents[1] / "xorgctl"
    destination = pathlib.Path.home() / ".local/bin/xorgctl"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(f'#!/bin/sh\nexec {interpreter} {source} "$@"\n')
    temporary.chmod(0o755)
    temporary.replace(destination)


def apply(expected_version: str) -> dict[str, object]:
    platform = _platform()
    if platform != {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION}:
        raise Fault("xorgctl setup supports Ubuntu 24.04 only")
    if expected_version != VERSION:
        raise Fault(f"requested Xorg version {expected_version} does not match installed {VERSION}")
    _install_packages()
    interpreter = _install_python()
    _install_fonts()
    _install_virtualgl()
    _install_launcher(interpreter)
    _install_services()
    if not (ROOT / "console/session.json").is_file():
        action, params, _mode = _console_plan()
        manage_session("console", action, params)
        manage_session("console", "stop", {})
    _command(["systemctl", "--user", "enable", "--now", _session_service("console")], check=True)
    active_sessions = [name for name in _configured_session_names() if _service_active(_session_service(name))]
    for name in active_sessions:
        _command(["systemctl", "--user", "restart", _session_service(name)], check=True)
    deadline = time.monotonic() + 20
    while any(_worker_version(name) != VERSION for name in active_sessions) and time.monotonic() < deadline:
        time.sleep(0.1)
    _ensure_virtual_media()
    result = status(expected_version)
    state = pathlib.Path.home() / ".local/state/xorgctl/setup.json"
    state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = state.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True))
    temporary.chmod(0o600)
    temporary.replace(state)
    if result["state"] != "ready":
        raise Fault("Xorg setup incomplete: " + ", ".join(result["missing"]))
    return result


def manage(action: str, params: dict[str, object]) -> dict[str, object]:
    expected = str(params.get("expected_version", VERSION))
    if action == "status":
        return status(expected)
    if action == "apply":
        return apply(expected)
    raise Fault("unknown setup operation")
