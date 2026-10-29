"""Compose the README 'inputs' graphic: Muse Image illustrations (assets/inputs/*.png) + code-drawn layout and text."""
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
FONTS = Path("C:/Windows/Fonts")
OR, INK, MUT, CARD, WHITE = (255, 106, 0), (30, 33, 38), (96, 104, 114), (255, 255, 255), (255, 255, 255)
import math
W, H = 2400, 1260


def font(size, bold=False):
    return ImageFont.truetype(str(FONTS / ("segoeuib.ttf" if bold else "segoeui.ttf")), size)


def icon(name, size):
    return Image.open(ROOT / "assets" / "inputs" / f"{name}.png").convert("RGB").resize((size, size), Image.LANCZOS)


def card(im, d, box, title, lines, art, tag=None, accent=False):
    x0, y0, x1, y1 = box
    d.rounded_rectangle(box, 28, fill=CARD if not accent else (255, 238, 224), outline=OR, width=4)
    s = y1 - y0 - 40
    im.paste(icon(art, s), (x0 + 22, y0 + 20))
    tx = x0 + s + 50
    d.text((tx, y0 + 28), title, font=font(44, True), fill=INK)
    for i, ln in enumerate(lines):
        d.text((tx, y0 + 92 + i * 40), ln, font=font(30), fill=MUT)
    if tag:
        tw = d.textlength(tag, font=font(24, True)) + 28
        d.rounded_rectangle((x1 - tw - 20, y1 - 62, x1 - 20, y1 - 22), 20, fill=OR)
        d.text((x1 - tw - 6, y1 - 58), tag, font=font(24, True), fill=WHITE)


def arrow(d, a, b, w=8):
    ang = math.atan2(b[1] - a[1], b[0] - a[0]); ax, ay = b
    d.line([a, (ax - 20 * math.cos(ang), ay - 20 * math.sin(ang))], fill=OR, width=w)
    p = lambda da, r: (ax - r * math.cos(ang + da), ay - r * math.sin(ang + da))
    d.polygon([(ax, ay), p(0.45, 34), p(-0.45, 34)], fill=OR)


im = Image.new("RGB", (W, H), WHITE)
d = ImageDraw.Draw(im)
logo = Image.open(ROOT / "assets" / "logo.png").convert("RGB").resize((96, 96), Image.LANCZOS)
im.paste(logo, (70, 44))
d.text((190, 40), "What WattLoop takes in", font=font(64, True), fill=INK)
d.text((192, 126), "From a factory you can only describe, photograph and read a bill for, to a plan an engineer can act on.", font=font(30), fill=MUT)

ys = [200, 450, 700, 950]
cards = [
    ("Photo of the plant", ["Muse Spark names the equipment,", "SAM 3.1 outlines it."], "photo", "photo OR description"),
    ("Description", ["Machines, shifts and problems", "in your own words."], "description", "photo OR description"),
    ("Monthly electricity bill", ["kWh per month: the cross-check", "the twin is calibrated to."], "bill", "required"),
    ("Machine list", ["Names, count, kW and hours.", "Biggest accuracy gain."], "machines", "optional"),
]
for (t, ls, art, tag), y in zip(cards, ys):
    card(im, d, (70, y, 930, y + 220), t, ls, art, tag)

cx0, cy0, cx1, cy1 = 1090, 330, 1700, 930
d.rounded_rectangle((cx0, cy0, cx1, cy1), 36, fill=(255, 238, 224), outline=OR, width=6)
d.text((cx0 + 44, cy0 + 40), "WattLoop agent loop", font=font(50, True), fill=INK)
steps = ["Muse Spark reads and designs", "SAM 3.1 locates the machines", "Twin calibrated to the bill", "Code simulator tests every fix", "Critic argues against the savings"]
for i, s in enumerate(steps):
    y = cy0 + 140 + i * 82
    d.ellipse((cx0 + 44, y + 6, cx0 + 84, y + 46), fill=OR)
    d.text((cx0 + 55, y + 6), str(i + 1), font=font(30, True), fill=WHITE)
    d.text((cx0 + 108, y + 4), s, font=font(34), fill=INK)
d.text((cx0 + 44, cy1 - 62), "Models propose. Code computes.", font=font(30, True), fill=OR)

for y in ys:
    arrow(d, (930, y + 110), (1086, 630))

ox0, oy0, ox1, oy1 = 1860, 200, 2330, 540
d.rounded_rectangle((ox0, oy0, ox1, oy1), 28, fill=CARD, outline=OR, width=4)
d.text((ox0 + 36, oy0 + 30), "Verified plan", font=font(46, True), fill=INK)
for i, ln in enumerate(["Fixes ranked by payback,", "saving range, confidence,", "PDF report with 3D views."]):
    d.text((ox0 + 36, oy0 + 100 + i * 42), ln, font=font(31), fill=MUT)
d.text((ox0 + 36, oy0 + 250), "Solar shown apart.", font=font(31, True), fill=OR)
arrow(d, (1700, 630), (1856, 400))

ex0, ey0, ex1, ey1 = 1860, 640, 2330, 1180
d.rounded_rectangle((ex0, ey0, ex1, ey1), 28, fill=WHITE, outline=OR, width=4)
im.paste(icon("engineer", 300), (ex0 + 85, ey0 + 24))
d.text((ex0 + 36, ey0 + 340), "Engineer decides", font=font(44, True), fill=INK)
d.text((ex0 + 36, ey0 + 400), "Approve, modify or reject,", font=font(31), fill=MUT)
d.text((ex0 + 36, ey0 + 440), "with a recorded note.", font=font(31), fill=MUT)
arrow(d, (2095, 540), (2095, 636))

d.text((70, 1195), "Illustrations generated with Muse Image 1.0. The plant and the numbers in the product are synthetic demos.", font=font(26), fill=MUT)
out = ROOT / "assets" / "screens" / "inputs.jpg"
im.save(out, quality=92)
print(out, im.size)
