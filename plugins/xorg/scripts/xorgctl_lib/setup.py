"""Idempotent, self-contained Ubuntu 24.04 setup for xorgctl."""
# ruff: noqa: ANN001, D103, PLR2004, S603

from __future__ import annotations

import hashlib
import json
import os
import pathlib
import re
import shlex
import shutil
import subprocess
import tarfile
import tempfile
import time

from .common import ROOT, VERSION, Fault, rpc
from .media import PIPER_CONFIG_SHA256, PIPER_MODEL_SHA256, PIPER_VERSION
from .sessions import manage as manage_session

UBUNTU_ID = "ubuntu"
UBUNTU_VERSION = "24.04"
SYSTEM_PYTHON = "/usr/bin/python3"
NERD_FONTS_VERSION = "3.5.1"
NERD_FONTS_SHA256 = "04d5e8f903693f9dd13e16f867e994834e681eb3c72c0d337a770dcda09010cf"
NERD_FONTS_URL = f"https://github.com/ryanoasis/nerd-fonts/releases/download/v{NERD_FONTS_VERSION}/JetBrainsMono.tar.xz"
VIRTUALGL_VERSION = "3.1.4-20251007"
VIRTUALGL_SHA256 = "02edc6b599571c385389af1a006f07a70c298e1d97c580a9bfd4b39d835c51e6"
VIRTUALGL_URL = "https://github.com/VirtualGL/virtualgl/releases/download/3.1.4/virtualgl_3.1.4_amd64.deb"
PIPER_MODEL_URL = "https://huggingface.co/rhasspy/piper-voices/resolve/v1.0.0/en/en_US/lessac/medium/en_US-lessac-medium.onnx"
PIPER_CONFIG_URL = PIPER_MODEL_URL + ".json"
REQUIRED_COMMANDS = (
    "Xvfb",
    "curl",
    "dpkg-query",
    "eglinfo",
    "ffmpeg",
    "fc-match",
    "fuser",
    "gsettings",
    "glxinfo",
    "loginctl",
    "modprobe",
    "openbox",
    "pactl",
    "systemctl",
    "tesseract",
    "udevadm",
    "v4l2-ctl",
    "vulkaninfo",
    "wmctrl",
    "xauth",
    "xdotool",
    "xdpyinfo",
    "xvfb-run",
    "x11vnc",
)
REQUIRED_MODULES = (
    "PIL",
    "PyQt6",
    "Xlib",
    "cv2",
    "gi",
    "keyring",
    "numpy",
    "piper",
    "playwright",
)
APT_PACKAGES = (
    "at-spi2-core",
    "curl",
    "dbus-x11",
    "ffmpeg",
    "fontconfig",
    "fonts-crosextra-caladea",
    "fonts-crosextra-carlito",
    "fonts-liberation",
    "fonts-noto-cjk",
    "fonts-noto-color-emoji",
    "fonts-noto-core",
    "kmod",
    "libxcb-cursor0",
    "gsettings-desktop-schemas",
    "libglib2.0-bin",
    "mesa-utils",
    "openbox",
    "pipewire-pulse",
    "psmisc",
    "pulseaudio-utils",
    "python3-keyring",
    "python3-pil",
    "python3-pyatspi",
    "python3-pyqt6",
    "python3-venv",
    "python3-xlib",
    "tesseract-ocr",
    "v4l-utils",
    "v4l2loopback-dkms",
    "vulkan-tools",
    "wireplumber",
    "wmctrl",
    "x11-utils",
    "x11-xserver-utils",
    "x11vnc",
    "xauth",
    "xdotool",
    "xvfb",
)
PINNED_PYTHON = (
    "numpy==2.2.6",
    "opencv-python-headless==4.12.0.88",
    f"piper-tts=={PIPER_VERSION}",
    "playwright==1.55.0",
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
    return {
        "id": values.get("ID", "unknown"),
        "version_id": values.get("VERSION_ID", "unknown"),
    }


def _command(
    argv: list[str], *, check: bool = False, timeout: int = 30, env=None
) -> subprocess.CompletedProcess[str]:
    try:
        result = subprocess.run(
            argv, text=True, capture_output=True, check=False, timeout=timeout, env=env
        )
    except FileNotFoundError as error:
        if check:
            message = f"command not found: {argv[0]}"
            raise Fault(message) from error
        return subprocess.CompletedProcess(argv, 127, "", "command not found")
    except subprocess.TimeoutExpired as error:
        message = f"{argv[0]} timed out after {timeout}s"
        raise Fault(message) from error
    if check and result.returncode:
        detail = (result.stderr or result.stdout).strip()[-1000:]
        message = f"{argv[0]} exited {result.returncode}: {detail}"
        raise Fault(message)
    return result


def _service_active(name: str) -> bool:
    return (
        shutil.which("systemctl") is not None
        and _command(["systemctl", "--user", "is-active", "--quiet", name]).returncode
        == 0
    )


def _session_service(name: str) -> str:
    return f"xorgctl-session@{name}.service"


def _worker_version(name: str) -> str | None:
    try:
        value = rpc(name, "status", {}).get("version")
        return str(value) if value is not None else None
    except (Fault, OSError, EOFError):
        return None


def _wait_for_workers(names: list[str]) -> None:
    deadline = time.monotonic() + 20
    pending = list(dict.fromkeys(names))
    while pending and time.monotonic() < deadline:
        pending = [name for name in pending if _worker_version(name) != VERSION]
        if pending:
            time.sleep(0.1)
    if pending:
        message = "Xorg session worker did not become ready: " + ", ".join(pending)
        raise Fault(message)


def _wait_for_services(names: list[str]) -> None:
    deadline = time.monotonic() + 20
    stable = dict.fromkeys(names, 0)
    while time.monotonic() < deadline:
        for name in names:
            stable[name] = stable[name] + 1 if _service_active(name) else 0
        if all(samples >= 3 for samples in stable.values()):
            return
        time.sleep(0.1)
    pending = [name for name, samples in stable.items() if samples < 3]
    message = "Xorg service did not become ready: " + ", ".join(pending)
    raise Fault(message)


def _session_config(name: str) -> dict[str, object]:
    try:
        value = json.loads((ROOT / name / "session.json").read_text())
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def _configured_session_names() -> list[str]:
    try:
        return sorted(
            path.parent.name for path in ROOT.glob("*/session.json") if path.is_file()
        )
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


def _venv_python() -> pathlib.Path:
    return pathlib.Path.home() / ".local/share/xorgctl/venv/bin/python"


def _dependency_checks() -> dict[str, object]:
    commands = {name: shutil.which(name) is not None for name in REQUIRED_COMMANDS}
    modules = dict.fromkeys(REQUIRED_MODULES, False)
    interpreter = _venv_python()
    if interpreter.is_file():
        script = (
            "import importlib.util,json,sys;"
            "print(json.dumps({name:importlib.util.find_spec(name) is not None "
            "for name in sys.argv[1:]}))"
        )
        result = _command([str(interpreter), "-c", script, *REQUIRED_MODULES])
        if result.returncode == 0:
            try:
                reported = json.loads(result.stdout)
                modules = {name: bool(reported.get(name)) for name in REQUIRED_MODULES}
            except (TypeError, ValueError):
                pass
    return {
        "ready": all(commands.values()) and all(modules.values()),
        "commands": commands,
        "python_modules": modules,
    }


def _font_status() -> dict[str, object]:
    if shutil.which("fc-match") is None:
        return {"ready": False, "version": NERD_FONTS_VERSION}
    result = _command(["fc-match", "-f", "%{family[0]}", "JetBrainsMono Nerd Font"])
    return {
        "ready": result.returncode == 0 and "JetBrainsMono Nerd Font" in result.stdout,
        "version": NERD_FONTS_VERSION,
    }


def _file_sha256(path: pathlib.Path) -> str | None:
    if not path.is_file():
        return None
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _speech_status() -> dict[str, object]:
    root = pathlib.Path.home() / ".local/share/xorgctl"
    model = root / "voices/en_US-lessac-medium.onnx"
    config = root / "voices/en_US-lessac-medium.onnx.json"
    interpreter = _venv_python()
    version = None
    if interpreter.is_file():
        result = _command(
            [
                str(interpreter),
                "-c",
                "import importlib.metadata; print(importlib.metadata.version('piper-tts'))",
            ]
        )
        version = result.stdout.strip() if result.returncode == 0 else None
    checks = {
        "runtime": version == PIPER_VERSION,
        "model": _file_sha256(model) == PIPER_MODEL_SHA256,
        "config": _file_sha256(config) == PIPER_CONFIG_SHA256,
    }
    return {"ready": all(checks.values()), "version": version, "checks": checks}


def _user_settings_env() -> dict[str, str]:
    runtime = f"/run/user/{os.getuid()}"
    return {
        **os.environ,
        "XDG_RUNTIME_DIR": runtime,
        "DBUS_SESSION_BUS_ADDRESS": f"unix:path={runtime}/bus",
    }


def _accessibility_status() -> dict[str, object]:
    if shutil.which("gsettings") is None:
        return {"ready": False, "toolkit_accessibility": False}
    result = _command(
        [
            "gsettings",
            "get",
            "org.gnome.desktop.interface",
            "toolkit-accessibility",
        ],
        env=_user_settings_env(),
    )
    ready = result.returncode == 0 and result.stdout.strip() == "true"
    return {"ready": ready, "toolkit_accessibility": ready}


def _configure_accessibility() -> None:
    _command(
        [
            "gsettings",
            "set",
            "org.gnome.desktop.interface",
            "toolkit-accessibility",
            "true",
        ],
        check=True,
        env=_user_settings_env(),
    )


def _camera_status() -> dict[str, object]:
    label = pathlib.Path("/sys/class/video4linux/video10/name")
    ready = (
        pathlib.Path("/dev/video10").exists()
        and label.is_file()
        and label.read_text().strip() == "xcsh Camera"
    )
    return {"ready": ready, "device": "/dev/video10", "label": "xcsh Camera"}


def _camera_output_ready() -> bool:
    result = _command(
        ["v4l2-ctl", "--device=/dev/video10", "--get-fmt-video-out"],
        timeout=10,
    )
    output = result.stdout
    return bool(
        result.returncode == 0
        and "Width/Height" in output
        and "1920/1080" in output
        and "'YU12'" in output
    )


def _loopback_devices() -> list[str]:
    parameter = pathlib.Path("/sys/module/v4l2loopback/parameters/video_nr")
    try:
        values = [int(value) for value in parameter.read_text().strip().split(",")]
    except (OSError, ValueError):
        return []
    return sorted(f"/dev/video{value}" for value in values if value >= 0)


def _camera_in_use() -> bool:
    result = _command(["fuser", "/dev/video10"], timeout=10)
    if result.returncode == 0:
        return True
    if result.returncode == 1:
        return False
    detail = (result.stderr or result.stdout).strip()
    message = f"could not determine /dev/video10 ownership: {detail}"
    raise Fault(message)


def _recover_virtual_camera() -> None:
    _command(["systemctl", "--user", "stop", "xcsh-camera.service"], check=True)
    if _camera_in_use():
        message = "/dev/video10 is in use; refusing to reset v4l2loopback"
        raise Fault(message)
    loopbacks = _loopback_devices()
    if loopbacks != ["/dev/video10"]:
        detail = ", ".join(loopbacks) if loopbacks else "none"
        message = (
            "expected /dev/video10 to be the sole v4l2loopback device "
            f"before recovery; found: {detail}"
        )
        raise Fault(message)
    _command(["sudo", "-n", "modprobe", "-r", "v4l2loopback"], check=True)
    _command(
        [
            "sudo",
            "-n",
            "modprobe",
            "v4l2loopback",
            "video_nr=10",
            "card_label=xcsh Camera",
            "exclusive_caps=1",
        ],
        check=True,
    )
    _command(["sudo", "-n", "udevadm", "control", "--reload-rules"], check=True)
    _command(
        ["sudo", "-n", "udevadm", "trigger", "--name-match=video10"],
        check=True,
    )
    _command(["sudo", "-n", "udevadm", "settle"], check=True)


def _audio_status() -> dict[str, object]:
    config = _session_config("console")
    sink = str(config.get("audio_sink", ""))
    source = str(config.get("audio_source", ""))
    try:
        devices = rpc("console", "audio.devices", {})
    except (Fault, OSError, EOFError):
        devices = {"sinks": [], "sources": []}
    sinks = devices.get("sinks", []) if isinstance(devices, dict) else []
    sources = devices.get("sources", []) if isinstance(devices, dict) else []
    live_sink = next(
        (
            item
            for item in sinks
            if item.get("name") == "xorgctl_console"
            and item.get("description") == "xcsh_Inbound_Audio"
        ),
        None,
    )
    live_source = next(
        (
            item
            for item in sources
            if item.get("name") == "xcsh_microphone_input"
            and item.get("description") == "xcsh Microphone"
        ),
        None,
    )
    ready = bool(
        config.get("virtual_audio") is True
        and sink == "xorgctl_console"
        and source == "xcsh_microphone_input"
        and live_sink
        and live_source
    )
    physical_fallback = bool(
        (sink and sink != "xorgctl_console")
        or (source and source != "xcsh_microphone_input")
    )
    return {
        "ready": ready,
        "sink": sink or None,
        "sink_description": live_sink.get("description") if live_sink else None,
        "source": source or None,
        "source_description": live_source.get("description") if live_source else None,
        "physical_fallback": physical_fallback,
    }


def _nvidia_detected() -> bool:
    return bool(
        shutil.which("nvidia-smi")
        and _command(["nvidia-smi", "-L"], timeout=15).returncode == 0
    )


def _virtualgl_status() -> dict[str, object]:
    required = _nvidia_detected()
    if not required:
        return {"required": False, "ready": True, "version": None}
    result = _command(["dpkg-query", "-W", "-f=${Version}", "virtualgl"], timeout=15)
    version = result.stdout.strip() if result.returncode == 0 else None
    return {
        "required": True,
        "ready": version == VIRTUALGL_VERSION,
        "version": version,
    }


def _gpu_status() -> dict[str, object]:
    if not _nvidia_detected():
        return {
            "detected": False,
            "required": False,
            "ready": True,
            "renderer": "native",
        }
    virtualgl = _virtualgl_status()
    config = _session_config("console")
    env = dict(os.environ)
    config_env = config.get("env")
    if isinstance(config_env, dict):
        env.update({str(key): str(value) for key, value in config_env.items()})
    vglrun = pathlib.Path("/opt/VirtualGL/bin/vglrun")
    result = (
        _command(
            [str(vglrun), "-d", "egl0", "glxinfo", "-B"],
            env=env,
            timeout=30,
        )
        if virtualgl["ready"] and vglrun.is_file()
        else None
    )
    ready = bool(
        virtualgl["ready"]
        and result
        and result.returncode == 0
        and "NVIDIA" in result.stdout
    )
    return {
        "detected": True,
        "required": True,
        "ready": ready,
        "renderer": "virtualgl-egl",
    }


def _console_plan() -> tuple[str, dict[str, str], str]:
    auth = pathlib.Path(f"/run/user/{os.getuid()}/gdm/Xauthority")
    if auth.is_file():
        result = _command(
            ["xdpyinfo"], env={**os.environ, "DISPLAY": ":0", "XAUTHORITY": str(auth)}
        )
        if result.returncode == 0:
            return "attach", {"display": ":0", "auth": str(auth)}, "attached_xorg"
    return "create", {"geometry": "1920x1080"}, "headless_xvfb"


def _download_verified(url: str, expected: str, destination: pathlib.Path) -> None:
    _command(
        [
            "curl",
            "--proto",
            "=https",
            "--tlsv1.2",
            "--fail",
            "--location",
            "--silent",
            "--show-error",
            "-o",
            str(destination),
            url,
        ],
        check=True,
        timeout=300,
    )
    if hashlib.sha256(destination.read_bytes()).hexdigest() != expected:
        message = f"download checksum mismatch for {destination.name}"
        raise Fault(message)


def _install_packages() -> None:
    _command(
        ["sudo", "-n", "env", "DEBIAN_FRONTEND=noninteractive", "apt-get", "update"],
        check=True,
        timeout=600,
    )
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
        timeout=600,
    )


def _install_python() -> pathlib.Path:
    venv = pathlib.Path.home() / ".local/share/xorgctl/venv"
    _command(
        [
            SYSTEM_PYTHON,
            "-m",
            "venv",
            "--clear",
            "--system-site-packages",
            str(venv),
        ],
        check=True,
        timeout=120,
    )
    _command(
        [str(venv / "bin/pip"), "install", *PINNED_PYTHON], check=True, timeout=600
    )
    return venv / "bin/python"


def _install_fonts() -> None:
    if _font_status()["ready"]:
        return
    destination = (
        pathlib.Path.home() / ".local/share/fonts/xorgctl/JetBrainsMonoNerdFont"
    )
    with tempfile.TemporaryDirectory(prefix="xorgctl-fonts-") as directory:
        archive = pathlib.Path(directory) / "JetBrainsMono.tar.xz"
        extracted = pathlib.Path(directory) / "fonts"
        extracted.mkdir()
        _download_verified(NERD_FONTS_URL, NERD_FONTS_SHA256, archive)
        with tarfile.open(archive, "r:xz") as bundle:
            members = [
                item
                for item in bundle.getmembers()
                if item.isfile()
                and re.fullmatch(
                    r"JetBrainsMonoNerdFont-[A-Za-z]+\.ttf",
                    pathlib.PurePosixPath(item.name).name,
                )
            ]
            if len(members) != 16:
                message = f"expected 16 JetBrains Mono faces, found {len(members)}"
                raise Fault(message)
            for member in members:
                source = bundle.extractfile(member)
                if source is None:
                    message = "font archive member could not be read"
                    raise Fault(message)
                target = extracted / pathlib.PurePosixPath(member.name).name
                target.write_bytes(source.read())
                target.chmod(0o644)
        if destination.exists():
            shutil.rmtree(destination)
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copytree(extracted, destination)
    config = pathlib.Path.home() / ".config/fontconfig/conf.d/50-xorgctl-rendering.conf"
    config.parent.mkdir(parents=True, exist_ok=True)
    config.write_text(
        '<?xml version="1.0"?><!DOCTYPE fontconfig SYSTEM "fonts.dtd"><fontconfig><alias><family>monospace</family><prefer><family>JetBrainsMono Nerd Font</family></prefer></alias><alias><family>sans-serif</family><prefer><family>Liberation Sans</family></prefer></alias><alias><family>serif</family><prefer><family>Liberation Serif</family></prefer></alias></fontconfig>\n'
    )
    config.chmod(0o644)
    _command(["fc-cache", "-f"], check=True, timeout=120)


def _install_voice() -> None:
    if _speech_status()["ready"]:
        return
    destination = pathlib.Path.home() / ".local/share/xorgctl/voices"
    destination.mkdir(parents=True, exist_ok=True, mode=0o700)
    with tempfile.TemporaryDirectory(prefix="xorgctl-voice-") as directory:
        model = pathlib.Path(directory) / "en_US-lessac-medium.onnx"
        config = pathlib.Path(directory) / "en_US-lessac-medium.onnx.json"
        _download_verified(PIPER_MODEL_URL, PIPER_MODEL_SHA256, model)
        _download_verified(PIPER_CONFIG_URL, PIPER_CONFIG_SHA256, config)
        for source in (model, config):
            target = destination / source.name
            temporary = target.with_suffix(target.suffix + ".tmp")
            shutil.copyfile(source, temporary)
            temporary.chmod(0o600)
            temporary.replace(target)


def _install_virtualgl() -> None:
    if not _nvidia_detected() or _virtualgl_status()["ready"]:
        return
    if os.uname().machine not in ("x86_64", "amd64"):
        message = "NVIDIA VirtualGL setup is not published for this architecture"
        raise Fault(message)
    with tempfile.TemporaryDirectory(prefix="xorgctl-virtualgl-") as directory:
        package = pathlib.Path(directory) / "virtualgl.deb"
        _download_verified(VIRTUALGL_URL, VIRTUALGL_SHA256, package)
        _command(
            [
                "sudo",
                "-n",
                "env",
                "DEBIAN_FRONTEND=noninteractive",
                "apt-get",
                "install",
                "-y",
                str(package),
            ],
            check=True,
            timeout=300,
        )


def _install_root_file(destination: str, content: str) -> None:
    with tempfile.NamedTemporaryFile("w", prefix="xorgctl-", delete=False) as stream:
        stream.write(content)
        temporary = pathlib.Path(stream.name)
    try:
        _command(
            ["sudo", "-n", "install", "-D", "-m", "0644", str(temporary), destination],
            check=True,
        )
    finally:
        temporary.unlink(missing_ok=True)


def _install_services() -> None:
    user = _command(["id", "-un"], check=True).stdout.strip()
    _install_root_file("/etc/modules-load.d/xcsh-camera.conf", "v4l2loopback\n")
    _install_root_file(
        "/etc/modprobe.d/xcsh-camera.conf",
        'options v4l2loopback video_nr=10 card_label="xcsh Camera" exclusive_caps=1\n',
    )
    _install_root_file(
        "/etc/udev/rules.d/99-xcsh-camera.rules",
        f'KERNEL=="video10", SUBSYSTEM=="video4linux", OWNER="{user}", GROUP="video", MODE="0660"\n',
    )
    systemd = pathlib.Path.home() / ".config/systemd/user"
    systemd.mkdir(parents=True, exist_ok=True)
    session_service = systemd / "xorgctl-session@.service"
    camera_service = systemd / "xcsh-camera.service"
    session_service.write_text(
        "[Unit]\nDescription=xorgctl session %i\nAfter=default.target\n\n[Service]\nType=simple\nExecStart=%h/.local/bin/xorgctl _service %i\nRestart=on-failure\nRestartSec=2\nKillMode=control-group\nUMask=0077\n\n[Install]\nWantedBy=default.target\n"
    )
    camera_service.write_text(
        "[Unit]\nDescription=xcsh virtual camera\nAfter=default.target\nConditionPathExists=/dev/video10\n\n[Service]\nExecStartPre=/usr/bin/v4l2-ctl --device=/dev/video10 --set-fmt-video-out=width=1920,height=1080,pixelformat=YU12\nExecStart=/usr/bin/ffmpeg -hide_banner -loglevel error -re -f lavfi -i testsrc2=size=1920x1080:rate=30 -vf \"drawtext=text='xcsh Camera':x=(w-text_w)/2:y=(h-text_h)/2:fontsize=72:fontcolor=white:box=1:boxcolor=black@0.65\" -pix_fmt yuv420p -s:v 1920x1080 -f v4l2 /dev/video10\nRestart=on-failure\nRestartSec=5\n\n[Install]\nWantedBy=default.target\n"
    )
    for path in (session_service, camera_service):
        path.chmod(0o644)
    _command(["sudo", "-n", "loginctl", "enable-linger", user], check=True)
    _command(["systemctl", "--user", "daemon-reload"], check=True)
    _command(
        [
            "systemctl",
            "--user",
            "enable",
            "--now",
            "pipewire.socket",
            "pipewire-pulse.socket",
            "wireplumber.service",
        ],
        check=True,
    )


def _ensure_virtual_media() -> None:
    if not _camera_status()["ready"]:
        if pathlib.Path("/sys/module/v4l2loopback").exists():
            message = (
                "v4l2loopback is active without the required /dev/video10 "
                "xcsh Camera; refusing to reset an in-use module"
            )
            raise Fault(message)
        _command(
            [
                "sudo",
                "-n",
                "modprobe",
                "v4l2loopback",
                "video_nr=10",
                "card_label=xcsh Camera",
                "exclusive_caps=1",
            ],
            check=True,
        )
        _command(["sudo", "-n", "udevadm", "control", "--reload-rules"], check=True)
        _command(
            ["sudo", "-n", "udevadm", "trigger", "--name-match=video10"], check=True
        )
    elif not _camera_output_ready():
        _recover_virtual_camera()
    _command(
        ["systemctl", "--user", "enable", "--now", "xcsh-camera.service"], check=True
    )
    _wait_for_services(["xcsh-camera.service"])
    rpc("console", "audio.create", {})


def status(expected_version: str) -> dict[str, object]:
    platform = _platform()
    dependencies = _dependency_checks()
    font = _font_status()
    accessibility = _accessibility_status()
    speech = _speech_status()
    camera = _camera_status()
    audio = _audio_status()
    gpu = _gpu_status()
    workers = session_worker_checks()
    worker = workers.get("console", {"ready": False, "version": None})
    workers_ready = bool(workers) and all(
        bool(item.get("ready")) for item in workers.values()
    )
    config = _session_config("console")
    session_mode = (
        "headless_xvfb"
        if config.get("owned") is True
        else "attached_xorg"
        if config
        else "unconfigured"
    )
    services = {
        "console": _service_active(_session_service("console")),
        "camera": _service_active("xcsh-camera.service"),
        "pipewire": _service_active("pipewire.service"),
        "pipewire_pulse": _service_active("pipewire-pulse.service"),
        "wireplumber": _service_active("wireplumber.service"),
    }
    checks: dict[str, object] = {
        "platform": platform == {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION},
        "version": expected_version == VERSION,
        "commands": dependencies["commands"],
        "python_modules": dependencies["python_modules"],
        "virtual_camera": camera,
        "fonts": font,
        "accessibility": accessibility,
        "services": services,
        "worker": worker,
        "session_workers": workers,
        "session_workers_ready": workers_ready,
    }
    ready = bool(
        checks["platform"]
        and checks["version"]
        and dependencies["ready"]
        and font["ready"]
        and accessibility["ready"]
        and speech["ready"]
        and camera["ready"]
        and audio["ready"]
        and gpu["ready"]
        and all(services.values())
        and worker["ready"]
        and workers_ready
    )
    missing: list[str] = []
    if not checks["platform"]:
        missing.append("platform")
    if not checks["version"]:
        missing.append("version")
    if not dependencies["ready"]:
        missing.append("dependencies")
    if not font["ready"]:
        missing.append("fonts")
    if not accessibility["ready"]:
        missing.append("accessibility")
    if not speech["ready"]:
        missing.append("speech")
    if not camera["ready"]:
        missing.append("virtual_camera")
    if not audio["ready"]:
        missing.append("virtual_audio")
    if not gpu["ready"]:
        missing.append("gpu_renderer")
    missing.extend(f"service:{name}" for name, value in services.items() if not value)
    if not worker["ready"]:
        missing.append("worker_version")
    missing.extend(
        f"worker_version:{name}"
        for name, item in workers.items()
        if name != "console" and not item.get("ready")
    )
    return {
        "state": "ready" if ready else "degraded",
        "version": VERSION,
        "expected_version": expected_version,
        "platform": platform,
        "session_mode": session_mode,
        "dependencies": dependencies,
        "accessibility": accessibility,
        "speech": speech,
        "services": services,
        "virtual_devices": {"camera": camera, "audio": audio},
        "gpu_renderer": gpu,
        "checks": checks,
        "missing": missing,
    }


def _install_launcher(interpreter: pathlib.Path) -> None:
    source = pathlib.Path(__file__).resolve().parents[1] / "xorgctl"
    destination = pathlib.Path.home() / ".local/bin/xorgctl"
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(".tmp")
    temporary.write_text(
        f"#!/bin/sh\nexec {shlex.quote(str(interpreter))} "
        f'{shlex.quote(str(source))} "$@"\n'
    )
    temporary.chmod(0o755)
    temporary.replace(destination)


def apply(expected_version: str) -> dict[str, object]:
    platform = _platform()
    if platform != {"id": UBUNTU_ID, "version_id": UBUNTU_VERSION}:
        message = "xorgctl setup supports Ubuntu 24.04 only"
        raise Fault(message)
    if expected_version != VERSION:
        message = (
            f"requested Xorg version {expected_version} does not match installed "
            f"{VERSION}"
        )
        raise Fault(message)
    dependencies = _dependency_checks()
    commands = dependencies.get("commands")
    python_modules = dependencies.get("python_modules")
    if not isinstance(commands, dict) or not all(commands.values()):
        _install_packages()
    if (
        not isinstance(python_modules, dict)
        or not all(python_modules.values())
        or not _venv_python().is_file()
    ):
        interpreter = _install_python()
    else:
        interpreter = _venv_python()
    _install_fonts()
    _install_voice()
    _install_virtualgl()
    _configure_accessibility()
    _install_launcher(interpreter)
    _install_services()
    if not (ROOT / "console/session.json").is_file():
        action, params, _mode = _console_plan()
        manage_session("console", action, params)
    console_service = _session_service("console")
    console_current = (
        _service_active(console_service) and _worker_version("console") == VERSION
    )
    if not console_current:
        manage_session("console", "stop", {})
    _command(
        ["systemctl", "--user", "enable", "--now", console_service],
        check=True,
    )
    if not console_current:
        _command(
            ["systemctl", "--user", "restart", console_service],
            check=True,
        )
    active_sessions = [
        name
        for name in _configured_session_names()
        if name != "console"
        if _service_active(_session_service(name))
        if _worker_version(name) != VERSION
    ]
    for name in active_sessions:
        _command(["systemctl", "--user", "restart", _session_service(name)], check=True)
    _wait_for_workers(["console", *active_sessions])
    _ensure_virtual_media()
    result = status(expected_version)
    state = pathlib.Path.home() / ".local/state/xorgctl/setup.json"
    state.parent.mkdir(parents=True, exist_ok=True, mode=0o700)
    temporary = state.with_suffix(".tmp")
    temporary.write_text(json.dumps(result, sort_keys=True))
    temporary.chmod(0o600)
    temporary.replace(state)
    if result["state"] != "ready":
        missing = result.get("missing")
        if not isinstance(missing, list) or not all(
            isinstance(item, str) for item in missing
        ):
            message = "Xorg setup incomplete: invalid missing status"
            raise Fault(message)
        raise Fault("Xorg setup incomplete: " + ", ".join(missing))
    return result


def manage(action: str, params: dict[str, object]) -> dict[str, object]:
    expected = str(params.get("expected_version", VERSION))
    if action == "status":
        return status(expected)
    if action == "apply":
        return apply(expected)
    message = "unknown setup operation"
    raise Fault(message)
