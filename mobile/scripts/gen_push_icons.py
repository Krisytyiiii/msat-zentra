#!/usr/bin/env python3
"""Regenerate the FCM notification icons from mobile/assets/zentra.png.

Android status-bar icons are a single-colour mask, so the status icon must be a
pure-white silhouette; the expanded view uses the full-colour logo. Both are
trimmed to the artwork so they stay centred at every density.

    python3 scripts/gen_push_icons.py

Requires Pillow (`pip install pillow`). Run from the `mobile/` directory.
"""

import os

from PIL import Image, ImageChops

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = os.path.join(ROOT, "assets", "zentra.png")
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")

# Densities Android asks for, in dp -> px.
SIZES = {
    "mdpi": 24,
    "hdpi": 36,
    "xhdpi": 48,
    "xxhdpi": 72,
    "xxxhdpi": 96,
}


def main() -> None:
    src = Image.open(SRC).convert("RGB")

    # The artwork sits on a near-white background. Alpha comes from the darkest
    # channel: white -> 0, saturated/dark artwork -> 255, AA edges graded.
    r, g, b = src.split()
    darkest = ImageChops.darker(ImageChops.darker(r, g), b)
    alpha = darkest.point(lambda v: 0 if v >= 250 else min(255, (250 - v) * 255 // 15))

    logo = src.convert("RGBA")
    logo.putalpha(alpha)

    # Trim to the artwork.
    bbox = alpha.point(lambda v: 255 if v > 8 else 0).getbbox()
    logo = logo.crop(bbox)

    def square(img: Image.Image, pad_ratio: float) -> Image.Image:
        side = int(max(img.size) * (1 + 2 * pad_ratio))
        canvas = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        canvas.paste(img, ((side - img.width) // 2, (side - img.height) // 2), img)
        return canvas

    # Full-colour large icon (expanded view + foreground local notices).
    large = square(logo, 0.06).resize((192, 192), Image.LANCZOS)
    large.save(os.path.join(RES, "drawable-nodpi", "ic_zentra_large.png"), optimize=True)

    # White silhouette for the status bar.
    white = Image.new("RGBA", logo.size, (255, 255, 255, 0))
    white.putalpha(logo.getchannel("A"))
    white = square(white, 0.04)

    for density, size in SIZES.items():
        out = white.resize((size, size), Image.LANCZOS)
        out.save(os.path.join(RES, f"drawable-{density}", "ic_stat_zentra.png"), optimize=True)

    print(f"regenerated notification icons from {SRC}")


if __name__ == "__main__":
    main()
