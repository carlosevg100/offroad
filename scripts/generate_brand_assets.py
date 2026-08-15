"""Generate browser and social assets from the approved Offroad Capital logo."""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
BRAND = PUBLIC / "brand"
SOURCE = BRAND / "offroad-capital-logo.png"

NAVY = (5, 25, 42, 255)
CARBON_TOP = (20, 22, 23, 255)
CARBON_BOTTOM = (10, 12, 13, 255)
WHITE = (246, 247, 245, 255)
MUTED = (160, 165, 168, 255)
GREEN = (165, 255, 0, 255)

REGULAR_FONT = Path("/System/Library/Fonts/Supplemental/Arial.ttf")
BOLD_FONT = Path("/System/Library/Fonts/Supplemental/Arial Bold.ttf")


def font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    path = BOLD_FONT if bold else REGULAR_FONT
    return ImageFont.truetype(str(path), size=size)


def make_symbol(source: Image.Image, size: int) -> Image.Image:
    # Bounds of the standalone approved symbol in the supplied wordmark.
    symbol = source.crop((169, 327, 527, 670))
    target_width = round(size * 0.90)
    target_height = round(target_width * symbol.height / symbol.width)
    symbol = symbol.resize((target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), NAVY)
    x = (size - target_width) // 2
    y = (size - target_height) // 2
    canvas.alpha_composite(symbol, (x, y))
    return canvas


def make_wordmark(source: Image.Image) -> Image.Image:
    # Includes measured transparent padding so the Capital baseline is never clipped.
    return source.crop((153, 311, 1380, 702))


def make_social_preview(symbol: Image.Image) -> Image.Image:
    width, height = 1200, 630
    canvas = Image.new("RGBA", (width, height), CARBON_TOP)
    pixels = canvas.load()
    for y in range(height):
        ratio = y / (height - 1)
        color = tuple(
            round(CARBON_TOP[channel] * (1 - ratio) + CARBON_BOTTOM[channel] * ratio)
            for channel in range(4)
        )
        for x in range(width):
            pixels[x, y] = color

    draw = ImageDraw.Draw(canvas, "RGBA")
    for x in range(0, width, 80):
        draw.line((x, 0, x, height), fill=(38, 40, 41, 255), width=1)
    for y in range(0, height, 80):
        draw.line((0, y, width, y), fill=(38, 40, 41, 255), width=1)

    mark = symbol.resize((84, 84), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (72, 62))
    draw.text((176, 63), "Offroad", font=font(42, bold=True), fill=WHITE)
    draw.text((178, 108), "Capital", font=font(21), fill=MUTED)

    draw.text(
        (74, 190),
        "AI-NATIVE PRIVATE CREDIT ORIGINATION & MARKET ACCESS",
        font=font(14, bold=True),
        fill=(166, 171, 174, 255),
        spacing=4,
    )

    headline_font = font(59, bold=True)
    draw.text((72, 252), "Private credit origination", font=headline_font, fill=WHITE)
    draw.text((72, 322), "beyond traditional channels.", font=headline_font, fill=WHITE)

    draw.text(
        (74, 440),
        "Structured for the market. Matched to the mandate.",
        font=font(23, bold=True),
        fill=(218, 221, 220, 255),
    )
    draw.rounded_rectangle((74, 511, 229, 555), radius=2, fill=GREEN)
    draw.text((92, 521), "GO OFFROAD.", font=font(17, bold=True), fill=(10, 15, 16, 255))

    draw.line((0, height - 8, width, height - 8), fill=GREEN, width=8)
    return canvas.convert("RGB")


def main() -> None:
    source = Image.open(SOURCE).convert("RGBA")
    BRAND.mkdir(parents=True, exist_ok=True)

    wordmark = make_wordmark(source)
    wordmark.save(BRAND / "offroad-capital-wordmark.png", optimize=True)

    symbol_1024 = make_symbol(source, 1024)
    symbol_1024.save(BRAND / "offroad-symbol.png", optimize=True)

    icon_512 = symbol_1024.resize((512, 512), Image.Resampling.LANCZOS)
    icon_192 = symbol_1024.resize((192, 192), Image.Resampling.LANCZOS)
    apple_icon = symbol_1024.resize((180, 180), Image.Resampling.LANCZOS)
    icon_512.save(PUBLIC / "icon-512.png", optimize=True)
    icon_192.save(PUBLIC / "icon-192.png", optimize=True)
    apple_icon.save(PUBLIC / "apple-touch-icon.png", optimize=True)

    # Multi-resolution ICO gives browsers a purpose-built 16 px and 32 px source.
    icon_512.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    png_buffer = BytesIO()
    icon_512.save(png_buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(png_buffer.getvalue()).decode("ascii")
    (PUBLIC / "icon.svg").write_text(
        "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 512 512\">"
        f"<image width=\"512\" height=\"512\" href=\"data:image/png;base64,{encoded}\"/>"
        "</svg>\n",
        encoding="utf-8",
    )

    social = make_social_preview(icon_512)
    social.save(PUBLIC / "social-preview.png", optimize=True, quality=92)


if __name__ == "__main__":
    main()
