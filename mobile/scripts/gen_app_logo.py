#!/usr/bin/env python3
"""Derive an app-ready logo with a transparent background.

`assets/zentra.png` is the full artwork on a near-white background, which reads
as a white square on dark screens. The splash and other in-app surfaces need
the mark alone, so this writes `assets/zentra_logo.png` (RGBA, trimmed).

    python3 scripts/gen_app_logo.py
"""

import os

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "zentra.png")
OUT = os.path.join(ROOT, "assets", "zentra_logo.png")


def main() -> None:
    src = Image.open(SRC).convert("RGB")
    r, g, b = src.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    alpha = darkest.point(lambda v: 0 if v >= 250 else min(255, (250 - v) * 255 // 15))

    logo = src.convert("RGBA")
    logo.putalpha(alpha)

    bbox = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    logo = logo.crop(bbox)

    side = int(max(logo.size) * 1.04)
    canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
    canvas.paste(logo, ((side - logo.width) // 2, (side - logo.height) // 2), logo)
    canvas.resize((1024, 1024), Image.LANCZOS).save(OUT, optimize=True)
    print(f"wrote {OUT}")


if __name__ == "__main__":
    main()
