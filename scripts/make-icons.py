# Draws the app icon (a domino on the slate background) at the sizes iOS/PWA need.
from PIL import Image, ImageDraw
import sys, os
out = sys.argv[1]
def icon(size, pad_ratio=0.0):
    S = size * 4
    im = Image.new('RGB', (S, S), '#1f3b4d')
    d = ImageDraw.Draw(im)
    w, h = S * 0.70, S * 0.38
    x0, y0 = (S - w) / 2, (S - h) / 2
    r = h * 0.16
    d.rounded_rectangle([x0 + S*0.012, y0 + S*0.025, x0 + w + S*0.012, y0 + h + S*0.025], r, fill='#142a37')
    d.rounded_rectangle([x0, y0, x0 + w, y0 + h], r, fill='#fbf8f1', outline='#d9d1bf', width=int(S*0.012))
    d.line([S/2, y0 + h*0.12, S/2, y0 + h*0.88], fill='#d9d1bf', width=int(S*0.014))
    pr = h * 0.085
    def pip(cx, cy, col='#1b1d22'):
        d.ellipse([cx-pr, cy-pr, cx+pr, cy+pr], fill=col)
    hw = w / 2
    # left half: 3 (diagonal); right half: 5
    for fx, fy in [(.25,.25),(.5,.5),(.75,.75)]:
        pip(x0 + hw*fx, y0 + h*fy)
    for fx, fy in [(.25,.25),(.75,.25),(.5,.5),(.25,.75),(.75,.75)]:
        pip(x0 + hw + hw*fx, y0 + h*fy)
    # brass spinner pin
    sr = h*0.05
    d.ellipse([S/2-sr, S/2-sr, S/2+sr, S/2+sr], fill='#b9811a')
    return im.resize((size, size), Image.LANCZOS)
os.makedirs(out, exist_ok=True)
for name, size in [('icon-192.png',192),('icon-512.png',512),('apple-touch-icon.png',180),('icon-1024.png',1024)]:
    icon(size).save(os.path.join(out, name))
print('ok')
