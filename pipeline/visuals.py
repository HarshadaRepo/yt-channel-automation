"""Thumbnail: a frame from the animation with big outlined text on the left."""
import textwrap
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

FONT_BOLD = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"


def _font(size: int):
    for path in (FONT_BOLD, "C:/Windows/Fonts/arialbd.ttf", "/System/Library/Fonts/Supplemental/Arial Bold.ttf"):
        try:
            return ImageFont.truetype(path, size)
        except OSError:
            continue
    return ImageFont.load_default()


def thumbnail(text: str, background: Path, out: Path) -> Path:
    img = Image.open(background).convert("RGB").resize((1280, 720), Image.LANCZOS)
    shade = Image.new("L", img.size)
    ImageDraw.Draw(shade).rectangle([0, 0, 700, 720], fill=170)
    img = Image.composite(Image.new("RGB", img.size, (0, 0, 0)), img, shade.filter(ImageFilter.GaussianBlur(70)))
    d = ImageDraw.Draw(img)
    lines = textwrap.wrap(text.upper(), 10)
    size = 170
    f = _font(size)
    while size > 60 and max(d.textlength(l, font=f) for l in lines) > 720:
        size -= 10
        f = _font(size)
    y = 360 - len(lines) * (size + 20) // 2
    for i, line in enumerate(lines):
        fill = (255, 201, 77) if i == len(lines) - 1 else (255, 255, 255)
        d.text((60, y), line, font=f, fill=fill, stroke_width=10, stroke_fill=(0, 0, 0))
        y += size + 20
    img.save(out, quality=92)
    return out
