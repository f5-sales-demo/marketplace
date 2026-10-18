#!/usr/bin/env python3
"""Render native ANSI frame buffers to private images; these are not desktop screenshots."""
# CLI filenames follow repository conventions; orchestration keeps one lifecycle owner.
# pylint: disable=invalid-name,too-many-locals,too-many-statements

import argparse
import json
from pathlib import Path

import pyte
from PIL import Image, ImageDraw, ImageFont
from wcwidth import wcswidth

HEX_COLOR_LENGTH = 6
COLORS = {
    "black": "#000000",
    "red": "#cc5555",
    "green": "#55aa55",
    "brown": "#aa8855",
    "blue": "#5555cc",
    "magenta": "#aa55aa",
    "cyan": "#55aaaa",
    "white": "#dddddd",
    "brightblack": "#777777",
    "brightred": "#ff8888",
    "brightgreen": "#88dd88",
    "brightbrown": "#dddd88",
    "brightblue": "#8888ff",
    "brightmagenta": "#dd88dd",
    "brightcyan": "#88dddd",
    "brightwhite": "#ffffff",
}


def main() -> None:
    """Run the explicitly scoped capture workflow."""
    p = argparse.ArgumentParser()
    p.add_argument("root", type=Path)
    p.add_argument("--font", type=Path, required=True)
    args = p.parse_args()
    out = args.root / "images"
    out.mkdir(mode=0o700, exist_ok=True)
    regular = ImageFont.truetype(str(args.font), 16)
    fallback = ImageFont.truetype(
        "/System/Library/Fonts/Supplemental/Arial Unicode.ttf", 16
    )
    cell_width = round(regular.getlength("M"))
    cell_height = 22
    count = 0
    glyph_cache: dict[tuple[str, str, str, int], Image.Image] = {}
    for path in sorted((args.root / "frames").glob("*.json")):
        value = json.loads(path.read_text())
        rows = value["lines"]
        screen = pyte.Screen(value["width"], max(1, len(rows)))
        pyte.Stream(screen).feed("\r\n".join(rows))
        light = value.get("theme") == "xcsh-light"
        bg = "#ffffff" if light else "#100e1b"
        fg = "#222222" if light else "#eeeeee"
        image = Image.new(
            "RGB", (value["width"] * cell_width + 16, len(rows) * cell_height + 16), bg
        )
        ImageDraw.Draw(image)

        def color(value: str, fallback: str) -> str:
            """Resolve a captured ANSI color or its declared default."""
            if value == "default":
                return fallback
            if len(value) == HEX_COLOR_LENGTH and all(
                c in "0123456789abcdef" for c in value.lower()
            ):
                return "#" + value
            return COLORS.get(value, fallback)

        for y in range(len(rows)):
            x = 0
            while x < value["width"]:
                cell = screen.buffer[y][x]
                span = max(1, wcswidth(cell.data))
                background = color(cell.bg, bg)
                foreground = color(cell.fg, fg)
                if cell.reverse:
                    background, foreground = foreground, background
                left, top = 8 + x * cell_width, 8 + y * cell_height
                key = (cell.data, background, foreground, span)
                glyph = glyph_cache.get(key)
                if glyph is None:
                    glyph = Image.new(
                        "RGB", (cell_width * span, cell_height), background
                    )
                    if cell.data.strip():
                        font = fallback if span > 1 else regular
                        ImageDraw.Draw(glyph).text(
                            (0, 0), cell.data, font=font, fill=foreground
                        )
                    glyph_cache[key] = glyph
                image.paste(glyph, (left, top))
                x += span
        image.save(out / (path.stem + ".png"))
        count += 1
    print("RENDERED_NATIVE_FRAMES", count)


if __name__ == "__main__":
    main()
