"""
Draws the Setup wizard images (build/setup-art/*.png) from src/assets/icon.png and the app's own palette
(src/main/style/edge.css: --e-bg, --e-brand ...). Run it only when the artwork should change, the PNG files are committed:

    python build/make-setup-art.py

Needs Pillow (pip install pillow) and the Segoe UI fonts of Windows. build/setup.iss lists the files and sizes.
Light and dark variants: the Setup (WizardStyle=modern dynamic) picks one by the Windows app mode.
"""
import os
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
OUT = os.path.join(ROOT, 'build', 'setup-art')
ICON = Image.open(os.path.join(ROOT, 'src', 'assets', 'icon.png')).convert('RGBA')
FONTS = os.path.join(os.environ.get('SystemRoot', 'C:\\Windows'), 'Fonts')

# palette (edge.css)
DARK = dict(top=(3, 3, 5), bottom=(21, 28, 40), glow=(86, 36, 179), title=(220, 226, 250), sub=(194, 170, 238), line=(112, 49, 204))
LIGHT = dict(top=(247, 244, 253), bottom=(222, 210, 246), glow=(112, 49, 204), title=(34, 22, 64), sub=(86, 36, 179), line=(86, 36, 179))

LARGE = [(164, 314), (192, 386), (246, 459), (328, 604)]   # 100%, 125%, 150%, 200% DPI
SMALL = [55, 64, 83, 110]


def font(name, size):
    return ImageFont.truetype(os.path.join(FONTS, name), size)


def gradient(w, h, top, bottom):
    img = Image.new('RGB', (w, h), top)
    px = img.load()
    for y in range(h):
        t = y / max(1, h - 1)
        c = tuple(round(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(w):
            px[x, y] = c
    return img


def large(w, h, p):
    s = w / 164.0
    img = gradient(w, h, p['top'], p['bottom']).convert('RGBA')
    # a soft glow behind the icon
    glow = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    gd = ImageDraw.Draw(glow)
    cx, cy, r = w / 2, h * 0.36, 62 * s
    gd.ellipse([cx - r, cy - r, cx + r, cy + r], fill=p['glow'] + (95,))
    glow = glow.filter(ImageFilter.GaussianBlur(26 * s))
    img = Image.alpha_composite(img, glow)
    size = round(104 * s)
    ic = ICON.resize((size, size), Image.LANCZOS)
    img.alpha_composite(ic, (round(cx - size / 2), round(cy - size / 2)))
    d = ImageDraw.Draw(img)
    f = font('segoeuib.ttf', round(22 * s))
    tw = d.textlength('SteamEdge', font=f)
    ty = round(h * 0.36 + 70 * s)
    d.text((cx - tw / 2, ty), 'SteamEdge', font=f, fill=p['title'])
    d.rounded_rectangle([cx - 14 * s, ty + 36 * s, cx + 14 * s, ty + 39 * s], radius=2 * s, fill=p['line'])
    f2 = font('segoeui.ttf', round(10 * s))
    t2 = 'by Miabeyefendi'
    tw2 = d.textlength(t2, font=f2)
    d.text((cx - tw2 / 2, h - 30 * s), t2, font=f2, fill=p['sub'])
    return img


def small(n):
    img = Image.new('RGBA', (n, n), (0, 0, 0, 0))
    ic = ICON.resize((n, n), Image.LANCZOS)
    img.alpha_composite(ic)
    return img


os.makedirs(OUT, exist_ok=True)
for tag, p in (('light', LIGHT), ('dark', DARK)):
    for w, h in LARGE:
        large(w, h, p).save(os.path.join(OUT, 'wizard-%s-%dx%d.png' % (tag, w, h)))
for n in SMALL:
    small(n).save(os.path.join(OUT, 'small-%d.png' % n))
print('written to', OUT)
