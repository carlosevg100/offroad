"""Generate every browser, product and social asset from the approved Offroad marks.

Two source files govern the whole identity and live in ``docs/brand/``:

``offroad-lockup.png``
    The full signature: the brush ring, the rule, and the Offroad logotype.
``offroad-symbol.png``
    The ring on its own.

Both arrive as black artwork on a real alpha channel, so the light variants are a
channel swap rather than a redraw: the alpha is preserved exactly and only the RGB
plane is replaced. Nothing here re-draws, re-traces or re-proportions the marks.

Run with ``python3 scripts/generate_brand_assets.py`` from the repository root.
"""

from __future__ import annotations

import base64
from io import BytesIO
from pathlib import Path

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
PUBLIC = ROOT / "apps" / "web" / "public"
BRAND = PUBLIC / "brand"
SOURCE = ROOT / "docs" / "brand"

# The product's rail colour. Square icons sit on it so the ring reads as the brand
# rather than as a hole punched in whatever surface the operating system supplies.
GROUND = (11, 13, 15, 255)
LIGHT = (240, 241, 242, 255)
DARK = (15, 18, 20, 255)

# A thin ring pressed against the edge of a 16 px favicon closes up. Reserving a
# fifth of the canvas on each side keeps the counter open at browser-tab size.
ICON_INSET = 0.20
SOCIAL_SIZE = (1200, 630)


def load(name: str) -> Image.Image:
    """Load a source mark and crop it to its own ink, discarding exported padding."""
    image = Image.open(SOURCE / name).convert("RGBA")
    box = image.getbbox()
    if box is None:
        raise SystemExit(f"{name} has no visible artwork")
    return image.crop(box)


def recolour(image: Image.Image, colour: tuple[int, int, int, int]) -> Image.Image:
    """Replace the RGB plane and keep the original alpha, anti-aliasing included."""
    alpha = image.getchannel("A")
    solid = Image.new("RGBA", image.size, colour)
    solid.putalpha(alpha)
    return solid


def fit_width(image: Image.Image, width: int) -> Image.Image:
    height = round(image.height * width / image.width)
    return image.resize((width, height), Image.LANCZOS)


def square_icon(symbol: Image.Image, size: int) -> Image.Image:
    """Centre the light ring on the brand ground with a reserved margin."""
    canvas = Image.new("RGBA", (size, size), GROUND)
    box = round(size * (1 - 2 * ICON_INSET))
    scale = box / max(symbol.width, symbol.height)
    mark = symbol.resize((round(symbol.width * scale), round(symbol.height * scale)), Image.LANCZOS)
    canvas.alpha_composite(mark, ((size - mark.width) // 2, (size - mark.height) // 2))
    return canvas


def social_preview(lockup: Image.Image) -> Image.Image:
    canvas = Image.new("RGBA", SOCIAL_SIZE, GROUND)
    mark = fit_width(lockup, round(SOCIAL_SIZE[0] * 0.52))
    canvas.alpha_composite(mark, ((SOCIAL_SIZE[0] - mark.width) // 2, (SOCIAL_SIZE[1] - mark.height) // 2))
    return canvas.convert("RGB")


def main() -> None:
    lockup = load("offroad-lockup.png")
    symbol = load("offroad-symbol.png")

    lockup_dark = recolour(lockup, DARK)
    lockup_light = recolour(lockup, LIGHT)
    symbol_dark = recolour(symbol, DARK)
    symbol_light = recolour(symbol, LIGHT)

    BRAND.mkdir(parents=True, exist_ok=True)
    fit_width(lockup_dark, 1600).save(BRAND / "offroad-lockup.png", optimize=True)
    fit_width(lockup_light, 1600).save(BRAND / "offroad-lockup-inverted.png", optimize=True)
    fit_width(symbol_dark, 512).save(BRAND / "offroad-symbol.png", optimize=True)
    fit_width(symbol_light, 512).save(BRAND / "offroad-symbol-inverted.png", optimize=True)

    icon_512 = square_icon(symbol_light, 512)
    icon_512.save(PUBLIC / "icon-512.png", optimize=True)
    square_icon(symbol_light, 192).save(PUBLIC / "icon-192.png", optimize=True)
    square_icon(symbol_light, 180).convert("RGB").save(PUBLIC / "apple-touch-icon.png", optimize=True)

    icon_512.save(
        PUBLIC / "favicon.ico",
        format="ICO",
        sizes=[(16, 16), (32, 32), (48, 48)],
    )

    buffer = BytesIO()
    icon_512.save(buffer, format="PNG", optimize=True)
    encoded = base64.b64encode(buffer.getvalue()).decode("ascii")
    (PUBLIC / "icon.svg").write_text(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">'
        f'<image width="512" height="512" href="data:image/png;base64,{encoded}"/>'
        "</svg>\n",
        encoding="utf-8",
    )

    social_preview(lockup_light).save(PUBLIC / "social-preview.png", optimize=True, quality=92)

    print("brand assets written to", PUBLIC)


if __name__ == "__main__":
    main()
