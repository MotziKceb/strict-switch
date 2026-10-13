"""Draws the shield icons in icons/. Run: python3 tools/make-icons.py"""

from pathlib import Path

from PIL import Image, ImageDraw

OUT = Path(__file__).resolve().parent.parent / "icons"
SCALE = 8  # Draw large and downsample for smooth edges.
BLUE = (58, 90, 140, 255)
WHITE = (255, 255, 255, 255)


def shield(size):
    s = size * SCALE
    img = Image.new("RGBA", (s, s), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    m = s * 0.06
    top, bottom, left, right, mid = m, s - m, m * 1.6, s - m * 1.6, s / 2
    d.polygon(
        [
            (mid, top),
            (right, top + s * 0.14),
            (right, s * 0.48),
            (mid + s * 0.22, s * 0.78),
            (mid, bottom),
            (mid - s * 0.22, s * 0.78),
            (left, s * 0.48),
            (left, top + s * 0.14),
        ],
        fill=BLUE,
    )
    # Check mark.
    w = max(s * 0.09, SCALE * 1.6)
    d.line([(s * 0.32, s * 0.5), (s * 0.45, s * 0.63), (s * 0.69, s * 0.37)], fill=WHITE, width=round(w), joint="curve")
    return img.resize((size, size), Image.LANCZOS)


for size in (16, 32, 48, 128):
    shield(size).save(OUT / f"icon{size}.png")
