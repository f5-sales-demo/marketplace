#!/usr/bin/env python3
# ruff: noqa: D103, T201
# pylint: disable=invalid-name
"""Published visual/response fixture for Ghostty-on-Xorg acceptance."""

from __future__ import annotations

import base64
import os
import select
import sys
import termios
import time
import tty

IMAGE_WIDTH = 32
IMAGE_HEIGHT = 32


def kitty_graphics_request() -> bytes:
    """Build a visibly high-contrast Kitty graphics transmission request."""
    pixels = bytearray()
    for y in range(IMAGE_HEIGHT):
        for x in range(IMAGE_WIDTH):
            pixels.extend((255, 80, 80) if (x // 4 + y // 4) % 2 else (80, 255, 160))
    encoded = base64.b64encode(bytes(pixels))
    return (
        f"\x1b_Ga=T,f=24,s={IMAGE_WIDTH},v={IMAGE_HEIGHT},i=1;".encode()
        + encoded
        + b"\x1b\\"
    )


def kitty_graphics_acknowledged(response: bytes) -> bool:
    """Return whether a Kitty graphics response acknowledges image id one."""
    return b"\x1b_Gi=1;OK\x1b\\" in response


def send_kitty_graphics() -> bool:
    """Render the fixture image and wait briefly for its terminal acknowledgement."""
    descriptor = sys.stdin.fileno()
    if not os.isatty(descriptor):
        return False
    previous = termios.tcgetattr(descriptor)
    try:
        tty.setcbreak(descriptor)
        sys.stdout.buffer.write(kitty_graphics_request())
        sys.stdout.buffer.flush()
        response = bytearray()
        deadline = time.monotonic() + 2
        while time.monotonic() < deadline:
            readable, _, _ = select.select(
                [descriptor], [], [], deadline - time.monotonic()
            )
            if not readable:
                break
            response.extend(os.read(descriptor, 4096))
            if kitty_graphics_acknowledged(response):
                return True
    finally:
        termios.tcsetattr(descriptor, termios.TCSADRAIN, previous)
    return False


def main() -> int:
    print("GHOSTTY-CAPABILITY-FIXTURE-v1")
    print("Nerd Font: \ue0b0 \uf120 \uf17c \uf1d3")
    print("Emoji fallback: 🚀 🔐 ✅")
    print("Box drawing: ┌────────┬────────┐")
    print("             │ Ghostty│ Herdr  │")
    print("             └────────┴────────┘")
    print("Truecolor: \x1b[38;2;255;80;80mRED\x1b[0m \x1b[38;2;80;255;160mGREEN\x1b[0m")
    print(
        "OSC 8: \x1b]8;;https://example.com/xcsh-ghostty-uat\x1b\\published fixture\x1b]8;;\x1b\\"
    )
    print(
        "SGR mouse enabled: \x1b[?1000h\x1b[?1006hSGR-MOUSE-READY\x1b[?1006l\x1b[?1000l"
    )
    print("Kitty graphics: high-contrast checkerboard requested")
    acknowledged = send_kitty_graphics()
    print("KITTY-GRAPHICS-ACK: OK" if acknowledged else "KITTY-GRAPHICS-ACK: MISSING")
    print("GHOSTTY-CAPABILITY-FIXTURE-END")
    return 0 if acknowledged else 1


if __name__ == "__main__":
    raise SystemExit(main())
