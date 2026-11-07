from pathlib import Path
import math
import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

S = 2048
OUT = Path('assets/brand')
OUT.mkdir(parents=True, exist_ok=True)

BG = (11, 9, 7)
ORANGE = (245, 98, 0)
ORANGE_LIGHT = (255, 138, 61)
CREAM = (243, 237, 231)
INK = (18, 12, 8)
FONT_BLACK = 'C:/Windows/Fonts/ariblk.ttf'
FONT_HAND = 'C:/Windows/Fonts/segoeprb.ttf'


def rounded_mask(size, radius):
    mask = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(mask)
    d.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=255)
    return mask


def gradient_tile(size, top, bottom, radius):
    y = np.linspace(0, 1, size)[:, None]
    arr = np.zeros((size, size, 3), dtype=np.float32)
    for i in range(3):
        arr[:, :, i] = top[i] * (1 - y) + bottom[i] * y
    grad = Image.fromarray(np.uint8(np.clip(arr, 0, 255)), 'RGB').convert('RGBA')
    mask = rounded_mask(size, radius)
    tile = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    tile.paste(grad, (0, 0), mask)
    return tile, mask


def make_tile(size, top, bottom, border, font_path, r_color, r_ratio, border_width):
    radius = int(size * 0.205)
    tile, mask = gradient_tile(size, top, bottom, radius)
    d = ImageDraw.Draw(tile)
    d.rounded_rectangle(
        (border_width // 2, border_width // 2, size - 1 - border_width // 2, size - 1 - border_width // 2),
        radius=radius,
        outline=border,
        width=border_width,
    )

    font = ImageFont.truetype(font_path, int(size * r_ratio))
    bbox = d.textbbox((0, 0), 'R', font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    # optical centre, slightly above geometric centre
    x = (size - tw) / 2 - bbox[0]
    y = (size - th) / 2 - bbox[1] - int(size * 0.012)
    d.text((x, y), 'R', font=font, fill=r_color)
    return tile


def background():
    yy, xx = np.mgrid[0:S, 0:S]
    cx, cy = S * 0.5, S * 0.47
    r = np.sqrt((xx - cx) ** 2 + (yy - cy) ** 2) / (S * 0.66)
    glow = np.clip(1 - r, 0, 1) ** 2.1
    base = np.zeros((S, S, 3), dtype=np.float32)
    for i in range(3):
        base[:, :, i] = BG[i]
    for i in range(3):
        base[:, :, i] += glow * (ORANGE_LIGHT[i] - BG[i]) * 0.22

    # edge vignette
    nx = (xx - S / 2) / (S / 2)
    ny = (yy - S / 2) / (S / 2)
    vignette = np.clip(1.0 - 0.28 * (nx * nx + ny * ny) ** 1.25, 0.68, 1.0)
    base *= vignette[:, :, None]

    # very fine grain
    rng = np.random.default_rng(17)
    grain = rng.normal(0, 2.2, (S, S, 1))
    base = np.clip(base + grain, 0, 255)
    return Image.fromarray(np.uint8(base), 'RGB').convert('RGBA')


def compose(tile, angle=-8.0, shadow=True):
    canvas = background()
    rotated = tile.rotate(angle, resample=Image.Resampling.BICUBIC, expand=True)
    w, h = rotated.size
    x = (S - w) // 2
    y = (S - h) // 2
    if shadow:
        alpha = rotated.getchannel('A').filter(ImageFilter.GaussianBlur(54))
        shadow_layer = Image.new('RGBA', (S, S), (0, 0, 0, 0))
        shadow_layer.paste(Image.new('RGBA', rotated.size, (0, 0, 0, 160)), (x, y + 28), alpha)
        canvas = Image.alpha_composite(canvas, shadow_layer)
    canvas = Image.alpha_composite(canvas, Image.new('RGBA', (S, S), (0, 0, 0, 0)))
    canvas.paste(rotated, (x, y), rotated)
    return canvas.convert('RGB')


def save(image, name):
    image.resize((1024, 1024), Image.Resampling.LANCZOS).save(OUT / name, 'PNG', optimize=True)
    image.resize((512, 512), Image.Resampling.LANCZOS).save(OUT / name.replace('.png', '-512.png'), 'PNG', optimize=True)


# primary: orange tile, cream edge, dark geometric R
primary_tile = make_tile(
    int(S * 0.62),
    (255, 116, 20),
    (226, 84, 0),
    (247, 238, 228),
    FONT_BLACK,
    INK,
    0.56,
    max(4, int(S * 0.0032)),
)
primary = compose(primary_tile, -8.0)
save(primary, 'reshop-telegram-avatar.png')

# alternate: cream tile, dark edge, hand-drawn R
light_tile = make_tile(
    int(S * 0.62),
    (248, 244, 238),
    (232, 224, 214),
    (20, 13, 8),
    FONT_HAND,
    (15, 11, 8),
    0.53,
    max(4, int(S * 0.0032)),
)
light = compose(light_tile, -8.0)
save(light, 'reshop-telegram-avatar-light.png')

for path in sorted(OUT.glob('*.png')):
    with Image.open(path) as im:
        print(path, im.size, path.stat().st_size)
