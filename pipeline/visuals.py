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


def banner_thumbnail(text: str, background: Path, out: Path) -> Path:
    """Painted thumbnail with a huge yellow, black-outlined hook across the top."""
    img = Image.open(background).convert("RGB")
    w, h = img.size
    scale = max(1280 / w, 720 / h)
    img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    left, top = (img.width - 1280) // 2, (img.height - 720) // 2
    img = img.crop((left, top, left + 1280, top + 720))
    d = ImageDraw.Draw(img)
    words = text.upper()
    size = 190
    f = _font(size)
    while size > 70 and d.textlength(words, font=f) > 1180:
        size -= 10
        f = _font(size)
    tw = d.textlength(words, font=f)
    d.text(((1280 - tw) / 2, 24), words, font=f, fill=(255, 221, 0), stroke_width=max(8, size // 14), stroke_fill=(0, 0, 0))
    img.save(out, quality=92)
    return out
