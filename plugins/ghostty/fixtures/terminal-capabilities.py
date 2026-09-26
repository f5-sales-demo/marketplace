#!/usr/bin/env python3
# ruff: noqa: D103, T201
# pylint: disable=invalid-name
"""Published visual/response fixture for Ghostty-on-Xorg acceptance."""

from __future__ import annotations

import base64
import sys

PNG = base64.b64decode(
    "iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAAMUlEQVR4nO3NMQEAAAgDINc/9K3h"
    "HFQgE1lV55x1Op1Op9PpdDqdTqfT6XQ6nU6n0+l0Ov0AXUEBPYTBhWYAAAAASUVORK5CYII="
)


def main() -> int:
    encoded = base64.b64encode(PNG).decode("ascii")
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
    sys.stdout.write(f"Kitty graphics: \x1b_Gf=100,a=T,q=2;{encoded}\x1b\\\n")
    print("KITTY-GRAPHICS-SENT")
    print("GHOSTTY-CAPABILITY-FIXTURE-END")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
