"""
Generates MindSpace app icons with 8 teardrop petals forming a star-void flower.
"""
import math, os, struct
from PIL import Image, ImageDraw

# ── Shape definition ──────────────────────────────────────────────────────────

def cubic_bezier(p0, p1, p2, p3, steps=80):
    pts = []
    for i in range(steps):
        t = i / steps
        mt = 1 - t
        x = mt**3*p0[0] + 3*mt**2*t*p1[0] + 3*mt*t**2*p2[0] + t**3*p3[0]
        y = mt**3*p0[1] + 3*mt**2*t*p1[1] + 3*mt*t**2*p2[1] + t**3*p3[1]
        pts.append((x, y))
    return pts

# Teardrop petal in normalised coords (tip at (0,-18), round end at (0,-54))
# Narrow enough so adjacent petals have a visible gap at the outer edge.
# Max half-width ±10 units at y≈-37  →  width/radial-length ≈ 10/36 = 0.28
SEGS = [
    ((0,-18), (5,-21),  (13,-29), (14,-37)),
    ((14,-37), (15,-46), (8,-54),  (0,-54)),
    ((0,-54), (-8,-54), (-15,-46), (-14,-37)),
    ((-14,-37), (-13,-29), (-5,-21), (0,-18)),
]

def petal_polygon(angle_deg: float, scale: float, cx: float, cy: float):
    pts = []
    for seg in SEGS:
        pts.extend(cubic_bezier(*seg))
    rad = math.radians(angle_deg)
    cos_a, sin_a = math.cos(rad), math.sin(rad)
    out = []
    for x, y in pts:
        rx = x * cos_a - y * sin_a
        ry = x * sin_a + y * cos_a
        out.append((rx * scale + cx, ry * scale + cy))
    return out

# ── Render ────────────────────────────────────────────────────────────────────

BG     = (26,  24,  22,  255)   # near-black, warm
PETAL  = (237, 231, 221, 255)   # warm off-white

def render(size: int) -> Image.Image:
    # Full solid square — macOS clips to rounded rect in the Dock automatically.
    # Transparent corners cause a white border artifact in the Dock.
    img  = Image.new("RGBA", (size, size), BG)
    draw = ImageDraw.Draw(img)

    # 8 petals — outer radius fills ~82% of half-width
    scale = (size * 0.82 / 2) / 54
    cx = cy = size / 2
    for angle in range(0, 360, 45):
        poly = petal_polygon(angle, scale, cx, cy)
        draw.polygon(poly, fill=PETAL)

    return img

# ── Save all Tauri icon sizes ─────────────────────────────────────────────────

ICONS_DIR = os.path.join(os.path.dirname(__file__), "..", "src-tauri", "icons")

SIZES = {
    "32x32.png":        32,
    "128x128.png":      128,
    "128x128@2x.png":   256,
    "icon.png":         512,
    # Windows square logos
    "Square30x30Logo.png":   30,
    "Square44x44Logo.png":   44,
    "Square71x71Logo.png":   71,
    "Square89x89Logo.png":   89,
    "Square107x107Logo.png": 107,
    "Square142x142Logo.png": 142,
    "Square150x150Logo.png": 150,
    "Square284x284Logo.png": 284,
    "Square310x310Logo.png": 310,
    "StoreLogo.png":         50,
}

# Render at high res then downscale
source = render(1024)

for fname, px in SIZES.items():
    out = source.resize((px, px), Image.LANCZOS)
    dest = os.path.join(ICONS_DIR, fname)
    out.save(dest)
    print(f"  ✓ {fname} ({px}×{px})")

# ── ICO (Windows) ─────────────────────────────────────────────────────────────

def make_ico(images: list[Image.Image], path: str):
    """Write a valid ICO file without relying on PIL's broken ICO saver."""
    ico_sizes = [16, 24, 32, 48, 64, 128, 256]
    entries = []
    for sz in ico_sizes:
        img = images[0].resize((sz, sz), Image.LANCZOS).convert("RGBA")
        import io
        buf = io.BytesIO()
        img.save(buf, format="PNG")
        entries.append((sz, buf.getvalue()))

    header = struct.pack("<HHH", 0, 1, len(entries))
    offset = 6 + len(entries) * 16
    dir_entries = b""
    image_data = b""
    for sz, data in entries:
        w = h = sz if sz < 256 else 0
        dir_entries += struct.pack("<BBBBHHII", w, h, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        image_data += data
    with open(path, "wb") as f:
        f.write(header + dir_entries + image_data)

make_ico([source], os.path.join(ICONS_DIR, "icon.ico"))
print("  ✓ icon.ico")

print("\nAll icons generated.")
print("Run `cd src-tauri/icons && mkdir -p mindspace.iconset && \\")
print("     sips -z 16 16   icon.png --out mindspace.iconset/icon_16x16.png && \\")
print("     sips -z 32 32   icon.png --out mindspace.iconset/icon_16x16@2x.png && \\")
print("     sips -z 32 32   icon.png --out mindspace.iconset/icon_32x32.png && \\")
print("     sips -z 64 64   icon.png --out mindspace.iconset/icon_32x32@2x.png && \\")
print("     sips -z 128 128 icon.png --out mindspace.iconset/icon_128x128.png && \\")
print("     sips -z 256 256 icon.png --out mindspace.iconset/icon_128x128@2x.png && \\")
print("     sips -z 256 256 icon.png --out mindspace.iconset/icon_256x256.png && \\")
print("     sips -z 512 512 icon.png --out mindspace.iconset/icon_256x256@2x.png && \\")
print("     sips -z 512 512 icon.png --out mindspace.iconset/icon_512x512.png && \\")
print("     cp icon.png mindspace.iconset/icon_512x512@2x.png && \\")
print("     iconutil -c icns mindspace.iconset -o icon.icns`")
