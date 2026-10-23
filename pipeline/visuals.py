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


FONTS = Path(__file__).resolve().parent.parent / "assets" / "fonts"


def _hook_font(size: int, text: str):
    # The merged Hindi font carries Devanagari and Latin, so mixed titles like "1,000 साल" work.
    hindi = any("\u0900" <= ch <= "\u097f" for ch in text)
    try:
        return ImageFont.truetype(str(FONTS / ("Poppins-ExtraBold-Hindi.ttf" if hindi else "Poppins-ExtraBold.ttf")), size)
    except OSError:
        return _font(size)


def banner_thumbnail(text: str, background: Path, out: Path) -> Path:
    """Painted thumbnail, redesigned 2026-10-23 (Hats: thumbnails bring no traffic).

    The subject sits on the right; the left side is darkened for a 2-3 line hook in huge white type
    with a thick black outline, and the last line punches out on a yellow block. Colours and contrast
    are lifted so it stands out between other thumbnails at phone size.
    """
    from PIL import ImageEnhance

    img = Image.open(background).convert("RGB")
    w, h = img.size
    scale = max(1280 / w, 720 / h)
    img = img.resize((round(w * scale), round(h * scale)), Image.LANCZOS)
    left, top = (img.width - 1280) // 2, (img.height - 720) // 2
    img = img.crop((left, top, left + 1280, top + 720))
    img = ImageEnhance.Contrast(ImageEnhance.Color(img).enhance(1.3)).enhance(1.12)
    # dark fade behind the text on the left, a soft vignette everywhere
    shade = Image.new("L", img.size)
    ImageDraw.Draw(shade).rectangle([0, 0, 560, 720], fill=200)
    img = Image.composite(Image.new("RGB", img.size, (8, 10, 18)), img, shade.filter(ImageFilter.GaussianBlur(120)))
    vig = Image.new("L", img.size, 0)
    ImageDraw.Draw(vig).ellipse([-200, -160, 1480, 880], fill=255)
    img = Image.composite(img, Image.new("RGB", img.size, (0, 0, 0)), vig.filter(ImageFilter.GaussianBlur(140)))

    d = ImageDraw.Draw(img)
    words = text.strip().upper().split()
    # 2-3 lines, the punch word(s) last
    if len(words) <= 2:
        lines = words
    elif len(words) == 3:
        lines = [words[0], " ".join(words[1:])] if len(" ".join(words[1:])) <= 10 else words
    else:
        mid = len(words) // 2
        lines = [" ".join(words[:mid]), " ".join(words[mid:])]
    size = 150
    while True:
        f = _hook_font(size, text)
        widest = max(d.textlength(l, font=f) for l in lines)
        if (widest <= 600 and size * 1.15 * len(lines) <= 600) or size <= 60:
            break
        size -= 6
    gap = int(size * 1.12)
    y = (720 - gap * len(lines)) // 2
    stroke = max(6, size // 11)
    for i, line in enumerate(lines):
        last = i == len(lines) - 1 and len(lines) > 1
        x = 56
        if last:
            box = d.textbbox((x, y), line, font=f)
            d.rounded_rectangle([box[0] - 18, box[1] - 14, box[2] + 18, box[3] + 16], radius=14, fill=(255, 214, 0))
            d.text((x, y), line, font=f, fill=(15, 15, 20))
        else:
            d.text((x, y), line, font=f, fill=(255, 255, 255), stroke_width=stroke, stroke_fill=(0, 0, 0))
        y += gap
    img.save(out, quality=92)
    return out
