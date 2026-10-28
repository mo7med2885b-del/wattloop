"""Draws the synthetic demo plant illustration (clearly labelled synthetic)."""
from __future__ import annotations

import io

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ASSET = Path(__file__).resolve().parent.parent / "static" / "assets" / "demo-plant.png"  # generated once with Muse Image, labelled synthetic


def demo_png() -> bytes:
    f = ASSET
    if f.exists():
        return f.read_bytes()
    return _draw()


def _draw() -> bytes:
    W, H = 1280, 720
    im = Image.new("RGB", (W, H), (205, 210, 214))
    d = ImageDraw.Draw(im)
    try:
        f = ImageFont.truetype("arial.ttf", 22)
        fs = ImageFont.truetype("arial.ttf", 16)
    except OSError:
        f = fs = ImageFont.load_default()
    d.rectangle([0, 470, W, H], fill=(150, 154, 158))                      # floor
    for x in (180, 520, 860):                                                # ceiling lights, left on
        d.rectangle([x, 40, x + 230, 62], fill=(255, 250, 200), outline=(90, 90, 90))
        d.text((x + 40, 68), "fluorescent light (ON)", font=fs, fill=(60, 60, 60))
    d.rectangle([60, 250, 300, 470], fill=(70, 120, 170), outline=(30, 40, 60), width=3)  # pump skid
    d.text((70, 215), "two water pumps", font=f, fill=(20, 20, 20))
    d.ellipse([100, 300, 170, 370], fill=(90, 90, 100)); d.ellipse([190, 300, 260, 370], fill=(90, 90, 100))
    d.line([150, 250, 150, 200], fill=(40, 40, 40), width=8); d.rectangle([128, 195, 172, 215], fill=(190, 40, 40))
    d.text((60, 175), "discharge valve half closed", font=fs, fill=(150, 20, 20))
    d.rectangle([380, 220, 640, 470], fill=(200, 160, 50), outline=(60, 50, 20), width=3)  # compressor
    d.ellipse([420, 140, 600, 230], fill=(210, 215, 220), outline=(60, 60, 60), width=3)
    d.text((395, 100), "air compressor (hissing leaks)", font=f, fill=(20, 20, 20))
    for i in range(4):
        d.arc([650 + i * 12, 280, 700 + i * 12, 330], 300, 60, fill=(80, 80, 200), width=3)
    d.rectangle([720, 300, 1020, 360], fill=(80, 80, 85), outline=(20, 20, 20), width=3)   # conveyor
    d.text((720, 265), "conveyor and mixer motors", font=f, fill=(20, 20, 20))
    for x in range(740, 1000, 50):
        d.ellipse([x, 355, x + 30, 385], fill=(40, 40, 40))
    d.rectangle([1060, 200, 1240, 330], fill=(235, 238, 240), outline=(50, 50, 50), width=3)  # cooling unit
    d.text((1070, 160), "packing-room cooling", font=f, fill=(20, 20, 20))
    d.text((1090, 250), "21 C", font=f, fill=(0, 90, 160))
    d.rectangle([1060, 400, 1240, 460], fill=(120, 120, 125))
    d.text((1065, 410), "idle machine, standby light on", font=fs, fill=(240, 240, 240))
    d.text((20, 690), "SYNTHETIC ILLUSTRATION generated for the WattLoop demo - not a real facility", font=fs, fill=(90, 20, 20))
    b = io.BytesIO(); im.save(b, "PNG")
    return b.getvalue()
