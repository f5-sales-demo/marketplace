#!/usr/bin/python3
# ruff: noqa: ANN001, ANN201, D103, S603, S607, T201
# pylint: disable=invalid-name,too-many-boolean-expressions,consider-using-with
"""Zoom Web substrate; no software installation, physical media or recording."""

import argparse
import contextlib
import json
import os
import re
import shutil
import socket
import subprocess
import sys
import time
import urllib.request
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
    return urlunparse(parsed._replace(netloc="app.zoom.us", path=path, fragment=""))


MAX_DISPLAY_NAME = 64
FIRST_PRINTABLE = 32


def display_name(value=None):
    """Keep the product identity independent of the operating-system account."""
    name = (
        value if value is not None else os.environ.get("XCSH_ZOOM_DISPLAY_NAME", "xcsh")
    )
    name = name.strip()
    if (
        not name
        or len(name) > MAX_DISPLAY_NAME
        or any(ord(c) < FIRST_PRINTABLE for c in name)
    ):
        message = "Zoom display name must contain 1-64 printable characters"
        raise ValueError(message)
    return name


def browser_process_arguments(pid):
    """Handle Chrome's Linux process-title rewrite without evaluating shell text."""
    raw = Path(f"/proc/{pid}/cmdline").read_bytes().rstrip(b"\x00")
    parts = raw.split(b"\x00")
    if len(parts) == 1:
        parts = raw.split(b" ")
    return parts


def launched_browser_pid(process, profile, port):
    """Bind the main browser identity reported by the owned CDP endpoint."""
    endpoint = f"http://127.0.0.1:{port}"
    deadline = time.monotonic() + 30
    while True:
        try:
            with urllib.request.urlopen(endpoint + "/json/version", timeout=1):  # noqa: S310 - fixed loopback endpoint
                break
        except OSError:
            if time.monotonic() >= deadline:
                process.terminate()
                message = "Owned Chrome endpoint did not initialize"
                raise ValueError(message) from None
            time.sleep(0.2)
    with playwright_runtime()() as playwright:
        browser = playwright.chromium.connect_over_cdp(endpoint, timeout=10000)
        try:
            session = browser.new_browser_cdp_session()
            rows = session.send("SystemInfo.getProcessInfo")["processInfo"]
            main = [row for row in rows if row["type"] == "browser"]
            if len(main) != 1:
                message = "One owned main Chrome process required"
                raise ValueError(message)
            pid = int(main[0]["id"])
            entry = Path(f"/proc/{pid}")
            argv = browser_process_arguments(pid)
            if (
                entry.stat().st_uid != os.getuid()
                or f"--user-data-dir={profile}".encode() not in argv
                or f"--remote-debugging-port={port}".encode() not in argv
            ):
                message = "Owned Chrome identity does not match launch"
                raise ValueError(message)
            return pid
        finally:
            browser.close()


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
    browser_log = (runtime / "pi-zoom-web-browser.log").open("w")
    Path(browser_log.name).chmod(0o600)
    process = subprocess.Popen(
        [
            "google-chrome-stable",
            "--ozone-platform=wayland",
            "--enable-features=WebRTCPipeWireCapturer",
            "--auto-select-screen-capture-source",
            "--no-first-run",
            "--no-default-browser-check",
            "--disk-cache-size=33554432",
            "--media-cache-size=33554432",
            "--disable-background-networking",
            "--user-data-dir=" + str(profile),
            "--remote-debugging-address=127.0.0.1",
            "--remote-debugging-port=" + str(port),
            "--app=about:blank",
        ],
        env={
            **os.environ,
            "XDG_SESSION_TYPE": "wayland",
            "XDG_CURRENT_DESKTOP": "Hyprland",
        },
        stdout=browser_log,
        stderr=browser_log,
        start_new_session=True,
    )
    browser_log.close()
    browser_pid = launched_browser_pid(process, profile, port)
    state = runtime / "pi-zoom-web-state.json"
    state.write_text(
        json.dumps(
            {
                "port": port,
                "pid": browser_pid,
                "profile": str(profile),
                "display_name": display_name(),
            }
        )
    )
    state.chmod(0o600)
    ready_file = runtime / "pi-zoom-web-guard-ready"
    ready_file.unlink(missing_ok=True)
    (runtime / "pi-zoom-web-guard-error").unlink(missing_ok=True)
    guard_log_path = runtime / "pi-zoom-web-guard.log"
    guard_log = guard_log_path.open("w")
    guard_log_path.chmod(0o600)
    worker = subprocess.Popen(
        [sys.executable, str(Path(__file__).resolve()), "_guard"],
        stdin=subprocess.PIPE,
        stdout=guard_log,
        stderr=guard_log,
        start_new_session=True,
    )
    guard_log.close()
    if worker.stdin is None:
        message = "Browser guard input unavailable"
        raise ValueError(message)
    worker.stdin.write(url.encode())
    worker.stdin.close()
    deadline = time.monotonic() + 45
    while not ready_file.exists():
        if worker.poll() is not None or time.monotonic() >= deadline:
            process.terminate()
            if worker.poll() is None:
                worker.terminate()
                worker.wait(timeout=5)
            message = "Persistent browser guard startup failed"
            raise ValueError(message)
        time.sleep(0.2)
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
    argv = browser_process_arguments(selected["pid"])
    if (
        f"--user-data-dir={selected['profile']}".encode() not in argv
        or f"--remote-debugging-port={port}".encode() not in argv
    ):
        message = "Owned browser identity expired"
        raise ValueError(message)
    return selected


def playwright_runtime():
    """Use the image's baked environment without runtime installation."""
    # pylint: disable=import-outside-toplevel
    # The image ships the dependency environment; this system-Python launcher
    # uses it explicitly without downloading anything during activation.

    if Path("/etc/pi-desktop/desktop-lock.json").is_file():
        sys.path[:0] = [
            str(p)
            for p in Path("/opt/pi-desktop/python/venv/lib").glob(
                "python*/site-packages"
            )
        ]
    from playwright.sync_api import sync_playwright  # noqa: PLC0415

    return sync_playwright


def maintain_browser_guard(page, selected):
    """Keep virtual-device protection alive while bounded UI checks retry."""
    # pylint: disable=import-outside-toplevel
    from playwright.sync_api import Error as BrowserError  # noqa: PLC0415

    hd_attempted = False
    while not page.is_closed():
        try:
            acknowledge_meeting_notices(page)
            name = page.locator("#input-for-name")
            if name.count() == 1 and name.is_visible() and not name.input_value():
                name.fill(selected.get("display_name", "xcsh"))
            if (
                not hd_attempted
                and page.locator('button[aria-label="More video controls"]').count()
                == 1
            ):
                hd_result = ensure_web_hd(page)
                if hd_result.get("hd") != "pending":
                    hd_path = (
                        Path(os.environ["XDG_RUNTIME_DIR"]) / "pi-zoom-web-hd.json"
                    )
                    hd_path.write_text(json.dumps(hd_result))
                    hd_path.chmod(0o600)
                    hd_attempted = True
        except BrowserError:
            if page.is_closed():
                break
            # A stale optional dialog is retried; the capture guard stays active.
        page.wait_for_timeout(1000)


def initialize_browser(url, persistent=False):
    """Install the virtual-device guard before loading any Zoom code."""
    deadline = time.monotonic() + 30
    while True:
        try:
            selected = owned_browser_state()
            break
        except (ValueError, OSError):
            if time.monotonic() >= deadline:
                raise
            time.sleep(0.2)
    endpoint = f"http://127.0.0.1:{selected['port']}"
    while True:
        try:
            with urllib.request.urlopen(endpoint + "/json/version", timeout=1):  # noqa: S310 - fixed loopback HTTP endpoint
                break
        except OSError:
            if time.monotonic() >= deadline:
                message = "Owned Chrome startup deadline exceeded"
                raise ValueError(message) from None
            time.sleep(0.2)
    with playwright_runtime()() as playwright:
        browser = playwright.chromium.connect_over_cdp(endpoint, timeout=10000)
        try:
            context = browser.contexts[0]
            origin = urlparse(url)
            context.grant_permissions(
                ["camera", "microphone"], origin=f"https://{origin.hostname}"
            )
            guard = Path(__file__).with_name("virtual-media-guard.js").read_text()
            page = context.pages[0]
            context.add_init_script(guard)
            page.goto(url, wait_until="commit", timeout=30000)
            navigation_deadline = time.monotonic() + 30
            while page.url == "about:blank":
                if time.monotonic() >= navigation_deadline:
                    message = "Zoom navigation did not commit"
                    raise ValueError(message)
                page.wait_for_timeout(200)
            page.wait_for_timeout(500)
            final = urlparse(page.url)
            if not final.hostname or not (
                final.hostname == "zoom.us" or final.hostname.endswith(".zoom.us")
            ):
                message = "Zoom navigation left the permitted origin"
                raise ValueError(message)
            context.grant_permissions(
                ["camera", "microphone"], origin=f"https://{final.hostname}"
            )
            page.evaluate(guard)
            if page.evaluate("window.__piZoomMediaGuard?.version") != 1:
                message = "Virtual media guard did not initialize"
                raise ValueError(message)
            name = page.locator("#input-for-name")
            if name.count() == 1 and name.is_visible():
                name.fill(selected.get("display_name", "xcsh"))
            if persistent:
                ready = Path(os.environ["XDG_RUNTIME_DIR"]) / "pi-zoom-web-guard-ready"
                ready.write_text("ready")
                ready.chmod(0o600)
                maintain_browser_guard(page, selected)
        finally:
            if persistent:
                with contextlib.suppress(ProcessLookupError):
                    os.kill(selected["pid"], 15)
            browser.close()


def acknowledge_meeting_notices(page):
    """Accept the authorized Zoom recording and AI/transcript notices."""
    acknowledgements = []
    for _ in range(4):
        matched = False
        for pattern, label, kind in (
            (
                r"this meeting is being recorded|consent to being recorded",
                "Got it",
                "recording",
            ),
            (r"this meeting is being transcribed|zoom ai is on", "OK", "ai_transcript"),
        ):
            # Resolve the notice text and its own dialog; unrelated OK controls
            # cannot be selected simply because a recording label is elsewhere.
            dialogs = page.locator(
                '[role="dialog"], [role="alertdialog"], .zm-modal, .zm-dialog, .notification-modal, .disclaimer-content'
            )
            notice = dialogs.filter(has_text=re.compile(pattern, re.IGNORECASE))
            buttons = notice.locator("button").filter(
                has_text=re.compile("^" + re.escape(label) + "$")
            )
            if notice.count() != 1:
                # Older Web clients expose notices as plain modal containers.
                # Match the smallest non-page ancestor containing both known
                # notice text and its exact acknowledgement button.
                candidates = page.locator("button").filter(
                    has_text=re.compile("^" + re.escape(label) + "$")
                )
                if candidates.count() == 1 and candidates.is_visible():
                    notice = (
                        candidates.locator(
                            "xpath=ancestor::*[not(self::body) and not(self::html)]"
                        )
                        .filter(has_text=re.compile(pattern, re.IGNORECASE))
                        .first
                    )
                    buttons = notice.locator("button").filter(
                        has_text=re.compile("^" + re.escape(label) + "$")
                    )
            if notice.count() == 1 and buttons.count() == 1 and buttons.is_visible():
                buttons.evaluate("button => button.click()")
                notice.wait_for(state="hidden", timeout=5000)
                acknowledgements.append(kind)
                matched = True
        if not matched:
            break
    return acknowledgements


def ensure_web_hd(page):
    """Open video settings, enable HD when offered, and report actual support."""
    tab = page.locator('[role="tab"][id="video"]')
    if tab.count() != 1:
        menu = page.locator('a[aria-label="Video Settings..."]')
        more = page.locator('button[aria-label="More video controls"]')
        if more.count() != 1:
            return {
                "hd": "pending",
                "verified": False,
                "reason": "meeting_video_controls_unavailable",
            }
        for _ in range(3):
            if menu.count() == 1 and menu.is_visible():
                break
            more.click(timeout=3000)
            page.wait_for_timeout(200)
        if menu.count() != 1 or not menu.is_visible():
            return {
                "hd": "pending",
                "verified": False,
                "reason": "web_video_settings_unavailable",
            }
        menu.click(timeout=3000)
        tab = page.locator('[role="tab"][id="video"]')
        tab.wait_for(state="visible", timeout=3000)
    tab.click(timeout=3000)
    page.wait_for_timeout(200)
    hd = page.get_by_label(re.compile(r"^(?:enable )?hd(?: video)?$", re.IGNORECASE))
    if hd.count() != 1:
        hd = page.locator('[role="checkbox"]').filter(
            has_text=re.compile(r"hd|high definition", re.IGNORECASE)
        )
    if hd.count() == 1 and hd.is_visible():
        before = hd.is_checked()
        hd.check(timeout=3000)
        result = {
            "hd": hd.is_checked(),
            "verified": hd.is_checked(),
            "changed": not before,
        }
    else:
        result = {
            "hd": "unavailable",
            "verified": False,
            "reason": "zoom_web_does_not_offer_hd_control",
        }
    # Settings close is scoped to its container; leave meeting controls untouched.
    close = page.locator('button.settings-dialog__close[aria-label="close"]')
    if close.count() == 1 and close.is_visible():
        close.click(timeout=3000)
    return result


DESKTOP_WIDTH = 1920
DESKTOP_HEIGHT = 1080
HAVE_CURRENT_DATA = 2


def share_frame_ready(sample):
    """Require actual desktop frames, never just enumerated track dimensions."""
    return (
        sample.get("width") == DESKTOP_WIDTH
        and sample.get("height") == DESKTOP_HEIGHT
        and sample.get("ready", 0) >= HAVE_CURRENT_DATA
        and sample.get("frames", 0) > 0
        and sample.get("track") == "live"
        and sample.get("surface") == "monitor"
    )


def control_web_share(page, action, requested):
    """Share the owned desktop and verify decoded frames and stop behavior."""
    stop = page.locator("button").filter(has_text=re.compile(r"^Stop Share$"))
    if action == "stop-share":
        if stop.count() == 1 and stop.is_visible():
            stop.click(timeout=5000, no_wait_after=True)
            stop.wait_for(state="hidden", timeout=5000)
        return {"exitCode": 0, "control": action, "current": "off", "verified": True}
    if requested not in (None, "desktop", "screen"):
        return {"exitCode": 1, "error": "web_share_requires_desktop", "verified": False}
    if stop.count() != 1 or not stop.is_visible():
        share = page.locator('button[aria-label="Share"]')
        if share.count() != 1 or not share.is_visible():
            return {
                "exitCode": 1,
                "error": "share_control_unavailable",
                "verified": False,
            }
        share.click(timeout=5000, no_wait_after=True)
    deadline = time.monotonic() + 30
    previous = None
    while time.monotonic() < deadline:
        sample = page.evaluate("""() => {
            const video = document.getElementById("sharer-client-sharing-canvas");
            const track = video?.srcObject?.getVideoTracks()[0];
            return {width: video?.videoWidth, height: video?.videoHeight,
                ready: video?.readyState, frames: video?.getVideoPlaybackQuality().totalVideoFrames,
                track: track?.readyState, surface: track?.getSettings().displaySurface};
        }""")
        if share_frame_ready(sample):
            if previous is not None and sample["frames"] > previous:
                return {
                    "exitCode": 0,
                    "control": action,
                    "current": "on",
                    "target": "desktop",
                    "verified": True,
                    "capture": sample,
                    "receiver_acceptance": "separate controlled meeting check",
                }
            previous = sample["frames"]
        page.wait_for_timeout(1000)
    if stop.count() == 1 and stop.is_visible():
        stop.click(timeout=5000, no_wait_after=True)
        stop.wait_for(state="hidden", timeout=5000)
    return {
        "exitCode": 1,
        "error": "share_frame_verification_failed",
        "verified": False,
    }


def meeting_state(page, controls):
    """Prefer visible terminal states over stale background controls."""
    removed = page.get_by_text("You have been removed", exact=True)
    if removed.count() == 1 and removed.is_visible():
        return "removed_by_host"
    return (
        "in_meeting"
        if any(
            re.fullmatch(r"leave(?: meeting)?", c["name"], re.IGNORECASE)
            for c in controls
        )
        else "unknown"
    )


def require_active_membership(state):
    """Reject host removal before any media action."""
    if state == "removed_by_host":
        message = "removed_by_host"
        raise ValueError(message)


def observe_or_control(action, requested=None):
    """Observe the owned Zoom browser and use visible semantic controls only."""
    selected = owned_browser_state()
    runtime = Path(os.environ["XDG_RUNTIME_DIR"])
    if not (runtime / "pi-zoom-web-guard-ready").is_file():
        message = "Owned virtual media guard is unavailable"
        raise ValueError(message)
    port = selected["port"]
    with playwright_runtime()() as playwright:
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
            if page.evaluate("window.__piZoomMediaGuard?.version") != 1:
                message = "Owned virtual media guard is unavailable"
                raise ValueError(message)
            acknowledgements = acknowledge_meeting_notices(page)
            controls = page.get_by_role("button").evaluate_all(
                "els=>els.filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height).map(e=>({name:e.getAttribute('aria-label')||e.innerText,pressed:e.getAttribute('aria-pressed')}))"
            )
            current_meeting = meeting_state(page, controls)
            if action == "awareness":
                return {
                    "exitCode": 0,
                    "backend": "zoom-web",
                    "controls": controls,
                    "acknowledged_notices": acknowledgements,
                    "outbound_video": page.evaluate(
                        "window.__piZoomMediaGuard.stats?.()"
                    )
                    or [],
                    "virtual_media": page.evaluate(
                        "window.__piZoomMediaGuard.status()"
                    ),
                    "hd": json.loads((runtime / "pi-zoom-web-hd.json").read_text())
                    if (runtime / "pi-zoom-web-hd.json").is_file()
                    else {"hd": "pending"},
                    "meeting_state": current_meeting,
                    "meeting_joined": current_meeting == "in_meeting",
                    "receiver_acceptance": "pending controlled meeting",
                    "recording": False,
                }
            require_active_membership(current_meeting)
            if action in ("share", "stop-share"):
                return control_web_share(page, action, requested)
            patterns = {
                "audio": {"on": r"^unmute(?:\b|$)", "off": r"^mute(?:\b|$)"},
                "video": {
                    "on": r"^(?:start video|start my video)(?:\b|$)",
                    "off": r"^(?:stop video|stop my video)(?:\b|$)",
                },
            }
            if action in patterns:
                if requested not in ("on", "off"):
                    message = "Explicit on/off state required"
                    raise ValueError(message)
                if requested == "on":
                    inventory = page.evaluate("window.__piZoomMediaGuard?.inventory()")
                    required = "videoinput" if action == "video" else "audioinput"
                    if (
                        not inventory
                        or sum(d["kind"] == required for d in inventory) != 1
                    ):
                        return {
                            "exitCode": 1,
                            "error": "virtual_device_guard_not_ready",
                            "recording": False,
                        }
                control = page.get_by_role(
                    "button",
                    name=re.compile(patterns[action][requested], re.IGNORECASE),
                )
                opposite = page.get_by_role(
                    "button",
                    name=re.compile(
                        patterns[action]["off" if requested == "on" else "on"],
                        re.IGNORECASE,
                    ),
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
    if sys.argv[1:] == ["_guard"]:
        initialize_browser(sys.stdin.read().strip(), persistent=True)
        return 0
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "action",
        choices=[
            "status",
            "verify",
            "join",
            "awareness",
            "audio",
            "video",
            "share",
            "stop-share",
            "leave",
        ],
    )
    parser.add_argument("target", nargs="?")
    parser.add_argument("--json", action="store_true")
    args = parser.parse_args()
    if args.action == "join":
        result = join(args.target or "")
        code = result["exitCode"]
    elif args.action in ("awareness", "audio", "video", "share", "stop-share", "leave"):
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
    except (ValueError, OSError, subprocess.TimeoutExpired, RuntimeError) as error:
        if sys.argv[1:] == ["_guard"]:
            diagnostic = Path(os.environ["XDG_RUNTIME_DIR"]) / "pi-zoom-web-guard-error"
            missing = (
                Path(error.filename).name
                if isinstance(error, FileNotFoundError) and error.filename
                else ""
            )
            diagnostic.write_text(
                type(error).__name__
                + (":" + missing if missing else "")
                + ": "
                + (str(error) if isinstance(error, ValueError) else "startup failed")
            )
            diagnostic.chmod(0o600)
        print(json.dumps({"exitCode": 1, "error": "zoom_web_operation_failed"}))
        raise SystemExit(1) from None
