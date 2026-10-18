#!/usr/bin/python3
# ruff: noqa: ANN001, ANN201, D103, S603, S607, T201
# pylint: disable=invalid-name,too-many-boolean-expressions,consider-using-with
"""Zoom Web substrate; no software installation, physical media or recording."""

import argparse
import json
import os
import re
import shutil
import socket
import subprocess
from pathlib import Path
from urllib.parse import urlparse, urlunparse


def status():
    commands = ("google-chrome-stable", "pactl", "v4l2-ctl", "ffmpeg")
    missing = [c for c in commands if not shutil.which(c)]
    camera = Path("/sys/class/video4linux/video42")
    virtual_camera = (camera / "name").is_file() and (
        camera / "name"
    ).read_text().strip() == "xcsh Camera"
    try:
        sources = subprocess.run(
            ["pactl", "list", "short", "sources"],
            capture_output=True,
            timeout=5,
            check=False,
        ).stdout.decode()
        sinks = subprocess.run(
            ["pactl", "list", "short", "sinks"],
            capture_output=True,
            timeout=5,
            check=False,
        ).stdout.decode()
    except (OSError, subprocess.TimeoutExpired):
        sources, sinks = "", ""
    camera_format = False
    if virtual_camera:
        try:
            probe = subprocess.run(
                ["v4l2-ctl", "--device=/dev/video42", "--all"],
                capture_output=True,
                text=True,
                timeout=5,
                check=False,
            )
            camera_format = (
                probe.returncode == 0
                and "Driver name      : v4l2 loopback" in probe.stdout
                and bool(re.search(r"Width/Height\s*:\s*1280/720", probe.stdout))
                and bool(re.search(r"Frames per second:\s*30[.]", probe.stdout))
            )
        except (OSError, subprocess.TimeoutExpired):
            camera_format = False
    audio = "xcsh_zoom_microphone" in sources and "xcsh_zoom_output" in sinks
    return {
        "backend": "zoom-web",
        "ready": not missing and virtual_camera and camera_format and audio,
        "missing_software": missing,
        "virtual_camera": virtual_camera,
        "virtual_camera_device": "/dev/video42",
        "camera_format_verified": camera_format,
        "virtual_audio": audio,
        "camera_profile": {"width": 1280, "height": 720, "fps": 30},
        "receiver_acceptance": "pending controlled meeting",
        "recording": False,
    }


def invitation(target):
    if re.fullmatch(r"\d{9,11}", target):
        return "https://app.zoom.us/wc/join/" + target
    parsed = urlparse(target)
    if (
        parsed.scheme != "https"
        or not parsed.hostname
        or not (parsed.hostname == "zoom.us" or parsed.hostname.endswith(".zoom.us"))
        or parsed.username
        or parsed.password
        or parsed.port not in (None, 443)
    ):
        message = "A complete HTTPS Zoom invitation or numeric meeting ID is required"
        raise ValueError(message)
    if not re.search(r"/(?:j|wc/join)/\d{9,11}(?:/|$)", parsed.path):
        message = "Unrecognized Zoom invitation path"
        raise ValueError(message)
    path = re.sub(r"^/j/", "/wc/join/", parsed.path)
    return urlunparse(parsed._replace(path=path, fragment=""))


def join(target):
    ready = status()
    if not ready["ready"]:
        return {
            "exitCode": 1,
            "error": "baked_zoom_web_prerequisites_missing",
            "status": ready,
        }
    url = invitation(target)
    runtime = Path(os.environ.get("XDG_RUNTIME_DIR", ""))
    if not runtime.is_absolute() or runtime.stat().st_uid != os.getuid():
        message = "Owned runtime directory required"
        raise ValueError(message)
    profile = runtime / "pi-zoom-web-profile"
    profile.mkdir(mode=0o700, exist_ok=True)
    preferences = profile / "Default/Preferences"
    preferences.parent.mkdir(mode=0o700, exist_ok=True)
    # Browser profile is private runtime state, excluded from image construction.
    if not preferences.exists():
        preferences.write_text(
            json.dumps(
                {
                    "media": {
                        "default_audio_capture_device": "xcsh_zoom_microphone",
                        "default_audio_render_device": "xcsh_zoom_output",
                    },
                    "profile": {
                        "default_content_setting_values": {
                            "media_stream_mic": 3,
                            "media_stream_camera": 3,
                        }
                    },
                }
            )
        )
        preferences.chmod(0o600)
    # Device enumeration in WebRTC uses opaque IDs. The controlled meeting must
    # select the labeled virtual camera/microphone and verify receiver behavior.
    with socket.socket() as listener:
        listener.bind(("127.0.0.1", 0))
        port = listener.getsockname()[1]
    process = subprocess.Popen(
        [
            "google-chrome-stable",
            "--ozone-platform=wayland",
            "--no-first-run",
            "--no-default-browser-check",
            "--user-data-dir=" + str(profile),
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=" + str(port),
            "--app=" + url,
        ],
        stdout=subprocess.DEVNULL,
        stderr=subprocess.DEVNULL,
        start_new_session=True,
    )
    state = runtime / "pi-zoom-web-state.json"
    state.write_text(
        json.dumps({"port": port, "pid": process.pid, "profile": str(profile)})
    )
    state.chmod(0o600)
    return {
        "exitCode": 0,
        "backend": "zoom-web",
        "browser_launched": True,
        "meeting_joined": "pending UI and receiver verification",
        "media_selection": "explicit virtual device selection required",
        "recording": False,
    }


MIN_BROWSER_PORT = 1024
MAX_BROWSER_PORT = 65535


def owned_browser_state():
    """Validate the launched process before attaching to its loopback endpoint."""
    runtime = Path(os.environ.get("XDG_RUNTIME_DIR", ""))
    state = runtime / "pi-zoom-web-state.json"
    if (
        not runtime.is_absolute()
        or state.is_symlink()
        or state.stat().st_uid != os.getuid()
        or state.stat().st_mode & 0o077
    ):
        message = "Owned private browser state required"
        raise ValueError(message)
    selected = json.loads(state.read_text())
    port = selected["port"]
    if (
        not isinstance(port, int)
        or isinstance(port, bool)
        or not MIN_BROWSER_PORT <= port <= MAX_BROWSER_PORT
    ):
        message = "Invalid owned browser port"
        raise ValueError(message)
    # Do not attach to a replaced process or profile after an interrupted session.
    argv = Path(f"/proc/{selected['pid']}/cmdline").read_bytes().split(b"\x00")
    if (
        f"--user-data-dir={selected['profile']}".encode() not in argv
        or f"--remote-debugging-port={port}".encode() not in argv
    ):
        message = "Owned browser identity expired"
        raise ValueError(message)
    return selected


def observe_or_control(action, requested=None):
    """Observe the owned Zoom browser and use visible semantic controls only."""
    selected = owned_browser_state()
    port = selected["port"]
    # pylint: disable=import-outside-toplevel
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    with sync_playwright() as playwright:
        browser = playwright.chromium.connect_over_cdp(
            f"http://127.0.0.1:{port}", timeout=10000
        )
        try:
            pages = [
                p
                for c in browser.contexts
                for p in c.pages
                if urlparse(p.url).hostname
                and (
                    urlparse(p.url).hostname == "zoom.us"
                    or urlparse(p.url).hostname.endswith(".zoom.us")
                )
            ]
            if len(pages) != 1:
                message = "One owned Zoom page required"
                raise ValueError(message)
            page = pages[0]
            controls = page.get_by_role("button").evaluate_all(
                "els=>els.filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({name:e.getAttribute('aria-label')||e.innerText,pressed:e.getAttribute('aria-pressed')}))"
            )
            if action == "awareness":
                return {
                    "exitCode": 0,
                    "backend": "zoom-web",
                    "controls": controls,
                    "meeting_joined": any(
                        re.search(r"leave", c["name"], re.IGNORECASE) for c in controls
                    ),
                    "receiver_acceptance": "pending controlled meeting",
                    "recording": False,
                }
            patterns = {
                "audio": {"on": r"^unmute(?:\b|$)", "off": r"^mute(?:\b|$)"},
                "video": {"on": r"^start video(?:\b|$)", "off": r"^stop video(?:\b|$)"},
            }
            if action in patterns:
                if requested not in ("on", "off"):
                    message = "Explicit on/off state required"
                    raise ValueError(message)
                # Enabling media is withheld until device-selection acceptance exists.
                if requested == "on":
                    return {
                        "exitCode": 1,
                        "error": "virtual_device_selection_not_qualified",
                        "recording": False,
                    }
                control = page.get_by_role(
                    "button",
                    name=re.compile(patterns[action][requested], re.IGNORECASE),
                )
                opposite = page.get_by_role(
                    "button", name=re.compile(patterns[action]["on"], re.IGNORECASE)
                )
                if opposite.count() == 1 and opposite.is_visible():
                    return {
                        "exitCode": 0,
                        "control": action,
                        "current": requested,
                        "changed": False,
                        "verified": True,
                    }
                if control.count() != 1 or not control.is_visible():
                    message = "Visible media control is ambiguous"
                    raise ValueError(message)
                control.click(timeout=5000)
                opposite.wait_for(state="visible", timeout=5000)
                return {
                    "exitCode": 0,
                    "control": action,
                    "current": requested,
                    "changed": True,
                    "verified": True,
                }
            if action == "leave":
                button = page.get_by_role(
                    "button", name=re.compile(r"^leave(?: meeting)?$", re.IGNORECASE)
                )
                if button.count() != 1 or not button.is_visible():
                    message = "Visible Leave control required"
                    raise ValueError(message)
                button.click(timeout=5000)
                confirm = page.get_by_role(
                    "button", name=re.compile(r"^leave meeting$", re.IGNORECASE)
                )
                confirm.wait_for(state="visible", timeout=5000)
                if confirm.count() != 1:
                    message = "Leave confirmation is ambiguous"
                    raise ValueError(message)
                confirm.click(timeout=5000)
                confirm.wait_for(state="hidden", timeout=5000)
                return {
                    "exitCode": 0,
                    "backend": "zoom-web",
                    "left": True,
                    "verified": True,
                    "recording": False,
                }
            message = "Unqualified Zoom Web operation"
            raise ValueError(message)
        finally:
            browser.close()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=["status", "verify", "join", "awareness", "audio", "video", "leave"],
    )
    parser.add_argument("target", nargs="?")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.action == "join":
        result = join(args.target or "")
        code = result["exitCode"]
    elif args.action in ("awareness", "audio", "video", "leave"):
        result = observe_or_control(args.action, args.target)
        code = result["exitCode"]
    else:
        result = status()
        code = 0 if args.action == "status" or result["ready"] else 1
    print(json.dumps(result))
    return code


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except (ValueError, OSError, subprocess.TimeoutExpired):
        print(json.dumps({"exitCode": 1, "error": "zoom_web_operation_failed"}))
        raise SystemExit(1) from None
