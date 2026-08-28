"""
themes.py - Color palettes for WorkBreak.

Each theme defines the full set of color keys used by the UI.
The active theme is read from state.settings.theme.
"""

THEMES = {
    "teal": {
        "label": "🌿  Foresta (verde acqua)",
        "bg":      "#0D2B2B",
        "bg2":     "#163535",
        "bg3":     "#0A2020",
        "accent":  "#4ECDC4",
        "accent2": "#FFD166",
        "text":    "#E8F4F3",
        "subtext": "#7BBFBB",
        "success": "#6BCB77",
        "danger":  "#FF6B6B",
        "border":  "#1E4040",
        "hover":   "#1E4A4A",
        "water":   "#5BA4CF",
        "grad_top":    "#0A2424",
        "grad_bottom": "#143838",
        "bg_style":     "radial",   # radial | linear | dots | waves
    },
    "midnight": {
        "label": "🌙  Mezzanotte (blu notte)",
        "bg":      "#0F1729",
        "bg2":     "#1A2540",
        "bg3":     "#0A0F1F",
        "accent":  "#7AA2F7",
        "accent2": "#E0AF68",
        "text":    "#C0CAF5",
        "subtext": "#6B7BA8",
        "success": "#9ECE6A",
        "danger":  "#F7768E",
        "border":  "#24304D",
        "hover":   "#2A3656",
        "water":   "#7DCFFF",
        "grad_top":    "#0A0F1F",
        "grad_bottom": "#1A2540",
        "bg_style":     "dots",
    },
    "sunset": {
        "label": "🌅  Tramonto (caldo)",
        "bg":      "#2B1810",
        "bg2":     "#3D2419",
        "bg3":     "#1F100A",
        "accent":  "#FF9E64",
        "accent2": "#FFD93D",
        "text":    "#F5E6D3",
        "subtext": "#C9A88A",
        "success": "#A8C66C",
        "danger":  "#FF6B6B",
        "border":  "#4A2E1F",
        "hover":   "#523524",
        "water":   "#6BBFCF",
        "grad_top":    "#3D1F12",
        "grad_bottom": "#1F100A",
        "bg_style":     "linear",
    },
    "rose": {
        "label": "🌸  Rosa (delicato)",
        "bg":      "#2B1620",
        "bg2":     "#3D2030",
        "bg3":     "#1F0F18",
        "accent":  "#FF8FB1",
        "accent2": "#FFCB7D",
        "text":    "#F5E0EA",
        "subtext": "#C99AB0",
        "success": "#A8D5A2",
        "danger":  "#FF5C8A",
        "border":  "#4A2838",
        "hover":   "#522E40",
        "water":   "#8AB8E0",
        "grad_top":    "#3D2030",
        "grad_bottom": "#1F0F18",
        "bg_style":     "waves",
    },
    "mono": {
        "label": "⬜  Monocromo (grigio)",
        "bg":      "#1A1A1A",
        "bg2":     "#262626",
        "bg3":     "#0F0F0F",
        "accent":  "#E0E0E0",
        "accent2": "#A0A0A0",
        "text":    "#F5F5F5",
        "subtext": "#888888",
        "success": "#B0B0B0",
        "danger":  "#D0D0D0",
        "border":  "#333333",
        "hover":   "#3A3A3A",
        "water":   "#C0C0C0",
        "grad_top":    "#222222",
        "grad_bottom": "#0F0F0F",
        "bg_style":     "linear",
    },
    "forest_light": {
        "label": "🌼  Chiaro (giorno)",
        "bg":      "#F4F1E8",
        "bg2":     "#E8E3D5",
        "bg3":     "#FBF9F3",
        "accent":  "#2A9D8F",
        "accent2": "#E76F51",
        "text":    "#264653",
        "subtext": "#6B7B6E",
        "success": "#52B788",
        "danger":  "#E63946",
        "border":  "#D4CDB8",
        "hover":   "#DDD7C5",
        "water":   "#457B9D",
        "grad_top":    "#FBF9F3",
        "grad_bottom": "#E8E3D5",
        "bg_style":     "dots",
    },
}

DEFAULT_THEME = "teal"


def get_theme(name: str) -> dict:
    """Return the color dict for a theme name, falling back to default."""
    return THEMES.get(name, THEMES[DEFAULT_THEME])


def theme_options():
    """Return [(key, label), ...] for building selectors."""
    return [(k, v["label"]) for k, v in THEMES.items()]


def _hex_to_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))


def _rgb_to_hex(rgb):
    return "#%02x%02x%02x" % tuple(max(0, min(255, int(c))) for c in rgb)


def draw_background(canvas, theme: dict, width: int, height: int):
    """Draw a themed background onto a tk.Canvas (gradient + optional pattern)."""
    canvas.delete("bg")
    style = theme.get("bg_style", "linear")
    top = _hex_to_rgb(theme.get("grad_top", theme["bg"]))
    bot = _hex_to_rgb(theme.get("grad_bottom", theme["bg2"]))

    if style == "radial":
        # Concentric rectangles from center fading outward
        steps = 60
        cx, cy = width / 2, height / 2
        maxr = (width**2 + height**2) ** 0.5 / 2
        for i in range(steps, 0, -1):
            t = i / steps
            col = _rgb_to_hex([bot[j] + (top[j]-bot[j]) * (1-t) for j in range(3)])
            r = maxr * t
            canvas.create_oval(cx-r, cy-r, cx+r, cy+r,
                               fill=col, outline=col, tags="bg")
    else:
        # Vertical linear gradient
        steps = 80
        for i in range(steps):
            t = i / steps
            col = _rgb_to_hex([top[j] + (bot[j]-top[j]) * t for j in range(3)])
            y0 = int(height * i / steps)
            y1 = int(height * (i+1) / steps)
            canvas.create_rectangle(0, y0, width, y1,
                                    fill=col, outline=col, tags="bg")

    # Overlay pattern
    if style == "dots":
        dot = theme.get("border", "#333333")
        spacing = 60
        for x in range(0, width, spacing):
            for y in range(0, height, spacing):
                canvas.create_oval(x-2, y-2, x+2, y+2,
                                   fill=dot, outline=dot, tags="bg")
    elif style == "waves":
        line_col = theme.get("border", "#333333")
        import math
        for base_y in range(0, height, 80):
            pts = []
            for x in range(0, width+20, 20):
                y = base_y + 15 * math.sin(x / 120.0)
                pts.extend([x, y])
            if len(pts) >= 4:
                canvas.create_line(*pts, fill=line_col, width=1,
                                   smooth=True, tags="bg")
