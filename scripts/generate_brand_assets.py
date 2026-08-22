"""Generate browser and social assets from the approved Offroad Capital logo."""

from __future__ import annotations

import base64
from collections import deque
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


def remove_white_background(source: Image.Image) -> Image.Image:
    """Recover a clean alpha channel from the supplied white-background artwork."""
    image = source.convert("RGBA")
    output = Image.new("RGBA", image.size)
    source_pixels = image.load()
    output_pixels = output.load()
    width, height = image.size

    # The supplied raster contains faint, isolated compression texture in its white field.
    # Retain only meaningful connected artwork before reconstructing anti-aliased alpha.
    foreground = bytearray(width * height)
    visited = bytearray(width * height)
    retained = bytearray(width * height)
    for y in range(height):
        for x in range(width):
            red, green, blue, _ = source_pixels[x, y]
            if max(255 - red, 255 - green, 255 - blue) >= 10:
                foreground[y * width + x] = 1

    for start in range(width * height):
        if not foreground[start] or visited[start]:
            continue
        queue = deque([start])
        visited[start] = 1
        component: list[int] = []
        while queue:
            current = queue.popleft()
            component.append(current)
            x = current % width
            y = current // width
            for neighbor in (
                current - 1 if x > 0 else -1,
                current + 1 if x + 1 < width else -1,
                current - width if y > 0 else -1,
                current + width if y + 1 < height else -1,
            ):
                if neighbor >= 0 and foreground[neighbor] and not visited[neighbor]:
                    visited[neighbor] = 1
                    queue.append(neighbor)
        if len(component) >= 80:
            for index in component:
                retained[index] = 1

    retained_image = Image.frombytes("L", image.size, bytes(255 if value else 0 for value in retained))
    retained_image = retained_image.filter(ImageFilter.MaxFilter(3))
    retained_pixels = retained_image.load()

    for y in range(image.height):
        for x in range(image.width):
            red, green, blue, _ = source_pixels[x, y]
            if retained_pixels[x, y] == 0:
                output_pixels[x, y] = (255, 255, 255, 0)
                continue
            distance = max(255 - red, 255 - green, 255 - blue)
            alpha = min(255, max(0, (distance - 2) * 5))
            if alpha == 0:
                output_pixels[x, y] = (255, 255, 255, 0)
                continue

            opacity = alpha / 255
            recovered = tuple(
                max(0, min(255, round((channel - 255 * (1 - opacity)) / opacity)))
                for channel in (red, green, blue)
            )
            output_pixels[x, y] = (*recovered, alpha)

    return output


def make_inverted(source: Image.Image) -> Image.Image:
    """Create the dark-surface variant while retaining the olive brand accent."""
    output = source.copy()
    pixels = output.load()

    for y in range(output.height):
        for x in range(output.width):
            red, green, blue, alpha = pixels[x, y]
            if alpha == 0:
                continue
            is_accent = green > 70 and blue < 110 and green >= red * 0.72
            if is_accent:
                pixels[x, y] = (red, green, blue, alpha)
                continue
            luminance = round(red * 0.2126 + green * 0.7152 + blue * 0.0722)
            inverted = max(176, 248 - round(luminance * 0.30))
            pixels[x, y] = (inverted, inverted, inverted, alpha)

    return output


def make_symbol(source: Image.Image, size: int) -> Image.Image:
    # Lighthouse and its immediate rock formation, without the wordmark.
    symbol = source.crop((155, 104, 710, 584))
    target_width = round(size * 0.90)
    target_height = round(target_width * symbol.height / symbol.width)
    symbol = symbol.resize((target_width, target_height), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), NAVY)
    x = (size - target_width) // 2
    y = (size - target_height) // 2
    canvas.alpha_composite(symbol, (x, y))
    return canvas


def make_wordmark(source: Image.Image) -> Image.Image:
    # Full institutional lockup with measured breathing room around all elements.
    return source.crop((44, 106, 2080, 590))


def make_social_preview(wordmark: Image.Image) -> Image.Image:
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

    mark_width = 430
    mark_height = round(mark_width * wordmark.height / wordmark.width)
    mark = wordmark.resize((mark_width, mark_height), Image.Resampling.LANCZOS)
    canvas.alpha_composite(mark, (70, 52))

    draw.text(
        (74, 190),
        "AI-DRIVEN PRIVATE CREDIT ORIGINATION & MARKET ACCESS",
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
    supplied = Image.open(SOURCE).convert("RGBA")
    source = remove_white_background(supplied)
    BRAND.mkdir(parents=True, exist_ok=True)

    wordmark = make_wordmark(source)
    wordmark.save(BRAND / "offroad-capital-wordmark.png", optimize=True)
    wordmark.save(BRAND / "offroad-capital-wordmark-v2.png", optimize=True)
    inverted_wordmark = make_inverted(wordmark)
    inverted_wordmark.save(BRAND / "offroad-capital-wordmark-inverted.png", optimize=True)
    inverted_wordmark.save(BRAND / "offroad-capital-wordmark-inverted-v2.png", optimize=True)

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

    social = make_social_preview(inverted_wordmark)
    social.save(PUBLIC / "social-preview.png", optimize=True, quality=92)


if __name__ == "__main__":
    main()
