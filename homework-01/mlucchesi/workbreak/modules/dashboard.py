"""
Dashboard - Daily stats, weekly chart, full settings, test panel
"""

import tkinter as tk
from tkinter import messagebox
import json
import os
from datetime import date, timedelta
from modules.state import AppState

from modules.themes import get_theme, theme_options, DEFAULT_THEME

# COLORS loaded from active theme; refreshed each time a window opens
COLORS = dict(get_theme(DEFAULT_THEME))


def _btn(parent, text, command, style="default", **kw):
    styles = {
        "default": dict(bg=COLORS["bg2"], fg=COLORS["subtext"], activebackground=COLORS["hover"]),
        "primary": dict(bg=COLORS["accent"],  fg="#0D2B2B", activebackground="#3DBDB5"),
        "danger":  dict(bg=COLORS["danger"],  fg="#0D2B2B", activebackground="#E05555"),
        "warning": dict(bg=COLORS["accent2"], fg="#0D2B2B", activebackground="#EEC155"),
    }
    s = styles.get(style, styles["default"])
    return tk.Button(parent, text=text, command=command,
                     relief="flat", bd=0, cursor="hand2",
                     font=("monospace", 12), padx=14, pady=8,
                     **s, **kw)


class Dashboard:
    def __init__(self, root: tk.Tk, state: AppState):
        self.root = root
        self.state = state
        self.window = None
        self._timer_ref = None

    def set_timer(self, timer):
        self._timer_ref = timer

    def _detect_fractional_scaling(self) -> bool:
        """Return True if any monitor uses a fractional (non-integer) scale."""
        import os
        import xml.etree.ElementTree as ET
        xml_path = os.path.expanduser("~/.config/monitors.xml")
        if not os.path.exists(xml_path):
            return False
        try:
            tree = ET.parse(xml_path)
            root = tree.getroot()
            configs = root.findall("configuration")
            if not configs:
                return False
            for lm in configs[-1].findall("logicalmonitor"):
                scale = float(lm.findtext("scale", "1") or "1")
                if abs(scale - round(scale)) > 0.01:
                    return True
        except Exception:
            pass
        return False

    def show(self):
        if self.window and self.window.winfo_exists():
            self.window.lift()
            self.window.focus_force()
            return
        self.root.after(0, lambda: self._build(start_tab=0))

    def show_settings(self):
        if self.window and self.window.winfo_exists():
            self.window.lift()
            return
        self.root.after(0, lambda: self._build(start_tab=1))

    # ── WINDOW BUILD ──────────────────────────────────────────────────────────
    def _build(self, start_tab=0):
        COLORS.clear()
        COLORS.update(get_theme(getattr(self.state.settings, "theme", "teal")))

        w = tk.Toplevel(self.root)
        self.window = w
        w.title("WorkBreak")
        w.configure(bg=COLORS["bg"])

        import re, subprocess as sp
        try:
            xr = sp.run(["xrandr","--query"], capture_output=True, text=True, timeout=3)
            for line in xr.stdout.splitlines():
                if " connected" in line and "primary" in line:
                    m = re.search(r'(\d+)x(\d+)\+(\d+)\+(\d+)', line)
                    if m:
                        sw, sh = int(m.group(1)), int(m.group(2))
                        ox, oy = int(m.group(3)), int(m.group(4))
                        win_w = min(1400, int(sw * 0.70))
                        win_h = min(960,  int(sh * 0.72))
                        cx = ox + (sw - win_w) // 2
                        cy = oy + (sh - win_h) // 2
                        w.geometry(f"{win_w}x{win_h}+{cx}+{cy}")
                        break
            else:
                w.geometry("1200x820")
        except Exception:
            w.geometry("1200x820")
        w.resizable(True, True)
        w.minsize(700, 500)
        w.attributes("-topmost", True)

        # ── Header — scales font with window width ──────────────────────────
        hdr = tk.Frame(w, bg=COLORS["bg2"])
        hdr.pack(fill="x")

        hdr_title = tk.Label(hdr, text="🌿  WorkBreak",
                 bg=COLORS["bg2"], fg=COLORS["accent"],
                 font=("monospace", 20, "bold"))
        hdr_title.pack(side="left", padx=32, pady=16)

        hdr_date = tk.Label(hdr, text=date.today().strftime("%A %d %B %Y"),
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 12))
        hdr_date.pack(side="right", padx=32, pady=16)

        # ── Tab bar ────────────────────────────────────────────────────────
        tab_bar = tk.Frame(w, bg=COLORS["bg3"])
        tab_bar.pack(fill="x")

        content = tk.Frame(w, bg=COLORS["bg"])
        content.pack(fill="both", expand=True)

        tab_frames = {
            "stats":    self._build_stats(content),
            "settings": self._build_settings(content),
            "test":     self._build_test(content),
        }

        active = tk.StringVar(value="")
        tab_buttons = {}

        TAB_DEFS = [
            ("stats",    "📊  Oggi"),
            ("settings", "⚙️  Impostazioni"),
            ("test",     "🧪  Test"),
        ]

        def show_tab(name):
            for frame in tab_frames.values():
                frame.pack_forget()
            tab_frames[name].pack(fill="both", expand=True)
            active.set(name)
            for key, btn in tab_buttons.items():
                btn.configure(
                    bg=COLORS["bg2"]  if key == name else COLORS["bg3"],
                    fg=COLORS["accent"] if key == name else COLORS["subtext"],
                )

        for key, label in TAB_DEFS:
            btn = tk.Button(
                tab_bar, text=label, relief="flat", bd=0,
                font=("monospace", 12), padx=22, pady=11,
                bg=COLORS["bg3"], fg=COLORS["subtext"],
                activebackground=COLORS["bg2"], cursor="hand2",
                command=lambda k=key: show_tab(k)
            )
            btn.pack(side="left")
            tab_buttons[key] = btn

        # ── Responsive resize handler (debounced) ─────────────────────────
        _resize_after = [None]

        def _do_resize():
            _resize_after[0] = None
            ww = w.winfo_width()
            # Header font
            fs = max(13, min(22, int(13 + (ww - 700) / 60)))
            hdr_title.configure(font=("monospace", fs, "bold"))
            hdr_date.configure(font=("monospace", max(10, fs - 6)))
            # Tab font
            tf = max(10, min(13, int(10 + (ww - 700) / 200)))
            for btn in tab_buttons.values():
                btn.configure(font=("monospace", tf))


        def _on_resize(event):
            if event.widget is not w:
                return
            if _resize_after[0]:
                w.after_cancel(_resize_after[0])
            _resize_after[0] = w.after(120, _do_resize)

        w.bind("<Configure>", _on_resize)

        show_tab(["stats", "settings", "test"][start_tab])

    # ── TAB: STATS ────────────────────────────────────────────────────────────
    def _build_stats(self, parent):
        frame = tk.Frame(parent, bg=COLORS["bg"])

        # ── Next break countdown banner ────────────────────────────────────
        banner = tk.Frame(frame, bg=COLORS["bg2"],
                          highlightthickness=1, highlightbackground=COLORS["border"])
        banner.pack(fill="x", padx=24, pady=(20, 0))

        banner_inner = tk.Frame(banner, bg=COLORS["bg2"])
        banner_inner.pack(fill="x", padx=24, pady=16)

        tk.Label(banner_inner, text="⏱  Prossima pausa tra",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 12)).pack(side="left")

        countdown_lbl = tk.Label(banner_inner, text="--:--",
                                 bg=COLORS["bg2"], fg=COLORS["accent"],
                                 font=("monospace", 28, "bold"))
        countdown_lbl.pack(side="left", padx=(14, 0))

        at_lbl = tk.Label(banner_inner, text="",
                          bg=COLORS["bg2"], fg=COLORS["subtext"],
                          font=("monospace", 11))
        at_lbl.pack(side="left", padx=(10, 0))

        # Progress bar
        prog_bg = tk.Frame(banner, bg=COLORS["border"], height=4)
        prog_bg.pack(fill="x", padx=0, pady=(0, 0))
        prog_bar = tk.Frame(prog_bg, bg=COLORS["accent"], height=4)
        prog_bar.place(x=0, y=0, relheight=1, width=0)

        def _update_countdown():
            if not frame.winfo_exists():
                return
            nbt = self.state.next_break_time
            if nbt is None:
                countdown_lbl.configure(text="--:--", fg=COLORS["subtext"])
                at_lbl.configure(text="")
                frame.after(1000, _update_countdown)
                return

            from datetime import datetime
            delta = (nbt - datetime.now()).total_seconds()

            if delta <= 0:
                countdown_lbl.configure(text="ora!", fg=COLORS["danger"])
                at_lbl.configure(text="")
                prog_bar.place(x=0, y=0, relheight=1, relwidth=1)
            else:
                mins = int(delta // 60)
                secs = int(delta % 60)
                countdown_lbl.configure(
                    text=f"{mins:02d}:{secs:02d}",
                    fg=COLORS["danger"] if delta < 120 else
                       COLORS["accent2"] if delta < 300 else
                       COLORS["accent"]
                )
                at_lbl.configure(text=f"alle {nbt.strftime('%H:%M')}")
                # Progress bar: fill = elapsed / interval
                interval = self.state.settings.work_interval_min * 60
                elapsed = interval - delta
                frac = max(0.0, min(1.0, elapsed / interval)) if interval > 0 else 0
                prog_bg.update_idletasks()
                W = prog_bg.winfo_width() or 400
                prog_bar.place(x=0, y=0, relheight=1, width=int(W * frac))

            frame.after(1000, _update_countdown)

        frame.after(100, _update_countdown)

        # ── Stat cards ─────────────────────────────────────────────────────
        s = self.state.today_stats
        total_mv = s.movement_detected + s.movement_missed
        cards_data = [
            ("☕", "Pause completate",  str(s.breaks_completed),  COLORS["accent"]),
            ("🃏", "Jolly rimasti",     str(self.state.jolly_remaining), COLORS["accent2"]),
            ("💧", "Acqua confermata",
             f"{s.water_confirmed}/{s.water_reminders}" if s.water_reminders else "—",
             COLORS["success"]),
            ("🤸", "Movimento OK",
             f"{s.movement_detected}/{total_mv}" if total_mv else "—",
             COLORS["success"]),
            ("⏭️", "Pause saltate",    str(s.breaks_skipped),    COLORS["danger"]),
            ("🃏", "Jolly usati",      str(s.jolly_used),        COLORS["accent2"]),
        ]

        # Fixed 3-column grid — columns expand with window (no dynamic relayout)
        grid = tk.Frame(frame, bg=COLORS["bg"])
        grid.pack(fill="x", padx=24, pady=20)
        for col in range(3):
            grid.columnconfigure(col, weight=1)

        for i, (emoji, label, value, color) in enumerate(cards_data):
            col, row = i % 3, i // 3
            card = tk.Frame(grid, bg=COLORS["bg2"],
                            highlightthickness=1, highlightbackground=COLORS["border"],
                            padx=18, pady=16)
            card.grid(row=row, column=col, padx=9, pady=9, sticky="nsew")
            tk.Label(card, text=emoji,  bg=COLORS["bg2"], fg=color,
                     font=("sans-serif", 22)).pack(anchor="w")
            tk.Label(card, text=value,  bg=COLORS["bg2"], fg=color,
                     font=("monospace", 26, "bold")).pack(anchor="w")
            tk.Label(card, text=label,  bg=COLORS["bg2"], fg=COLORS["subtext"],
                     font=("monospace", 10)).pack(anchor="w")

        # Weekly chart
        wk = tk.Frame(frame, bg=COLORS["bg2"],
                      highlightthickness=1, highlightbackground=COLORS["border"])
        wk.pack(fill="x", padx=24, pady=(0, 20))
        tk.Label(wk, text="Pause completate — ultimi 7 giorni",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 11, "bold")).pack(padx=18, pady=(14, 4), anchor="w")
        chart = tk.Canvas(wk, height=100, bg=COLORS["bg2"], highlightthickness=0)
        chart.pack(fill="x", padx=18, pady=(0, 16))
        _chart_after = [None]
        def _redraw_chart(e):
            if _chart_after[0]:
                chart.after_cancel(_chart_after[0])
            _chart_after[0] = chart.after(80, lambda: self._draw_week_chart(chart))
        chart.bind("<Configure>", _redraw_chart)

        return frame

    def _draw_week_chart(self, canvas):
        history = self._load_history()
        canvas.delete("all")
        max_val = max((v for v in history.values()), default=1) or 1
        days_it = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"]
        W = canvas.winfo_width() or 720
        bar_w = max(20, min(48, (W - 80) // 9))
        chart_h = 68
        gap = (W - 7 * bar_w) // 8
        for i in range(7):
            day = date.today() - timedelta(days=6 - i)
            val = history.get(str(day), 0)
            x1 = gap + i * (bar_w + gap)
            x2 = x1 + bar_w
            bar_h = int((val / max_val) * chart_h) if max_val else 0
            y1, y2 = 4 + chart_h - bar_h, 4 + chart_h
            color = COLORS["accent2"] if str(day) == str(date.today()) else COLORS["accent"]
            canvas.create_rectangle(x1, y1, x2, y2, fill=color, outline="")
            canvas.create_text(x1 + bar_w // 2, y2 + 12,
                               text=days_it[day.weekday()],
                               fill=COLORS["subtext"], font=("monospace", 9))
            if val:
                canvas.create_text(x1 + bar_w // 2, y1 - 9, text=str(val),
                                   fill=COLORS["text"], font=("monospace", 9, "bold"))

    def _load_history(self):
        result = {str(date.today()): self.state.today_stats.breaks_completed}
        hist_path = os.path.expanduser("~/.config/workbreak/history.json")
        if os.path.exists(hist_path):
            try:
                with open(hist_path) as f:
                    for entry in json.load(f):
                        result[entry["date"]] = entry.get("breaks_completed", 0)
            except Exception:
                pass
        return result

    # ── TAB: SETTINGS ─────────────────────────────────────────────────────────
    def _build_settings(self, parent):
        frame = tk.Frame(parent, bg=COLORS["bg"])

        # Scrollable settings panel.
        # The trick for reliable fill="x" inside a canvas:
        # place the inner Frame at x=0 and update its width in <Configure>.
        canvas = tk.Canvas(frame, bg=COLORS["bg"], highlightthickness=0)
        sb = tk.Scrollbar(frame, orient="vertical", command=canvas.yview)
        canvas.configure(yscrollcommand=sb.set)
        canvas.pack(side="left", fill="both", expand=True)
        sb.pack(side="right", fill="y")

        inner = tk.Frame(canvas, bg=COLORS["bg"])
        _win_id = canvas.create_window((0, 0), window=inner, anchor="nw")

        def _on_canvas_cfg(e):
            # Force inner to match canvas width — the key to fill="x" working
            canvas.itemconfigure(_win_id, width=e.width)
        def _on_inner_cfg(e):
            canvas.configure(scrollregion=canvas.bbox("all"))

        canvas.bind("<Configure>", _on_canvas_cfg)
        inner.bind("<Configure>",  _on_inner_cfg)

        def _scroll(n):
            canvas.yview_scroll(n, "units")
        def _mw(e): _scroll(int(-1*(e.delta/120))); return "break"
        def _b4(e): _scroll(-1); return "break"
        def _b5(e): _scroll(1);  return "break"

        def _bind_scroll(w):
            w.bind("<MouseWheel>", _mw)
            w.bind("<Button-4>",   _b4)
            w.bind("<Button-5>",   _b5)
            for child in w.winfo_children():
                _bind_scroll(child)

        canvas.bind("<MouseWheel>", _mw)
        canvas.bind("<Button-4>",   _b4)
        canvas.bind("<Button-5>",   _b5)
        inner.bind("<MouseWheel>",  _mw)
        inner.bind("<Button-4>",    _b4)
        inner.bind("<Button-5>",    _b5)
        # Re-bind scroll after all widgets are built
        inner.after(200, lambda: _bind_scroll(inner))

        self.vars = {}
        s = self.state

        # ── helpers ───────────────────────────────────────────────────────────
        def section(title):
            tk.Label(inner, text=title, bg=COLORS["bg"], fg=COLORS["accent"],
                     font=("monospace", 14, "bold")).pack(padx=32, pady=(28, 4), anchor="w")
            tk.Frame(inner, bg=COLORS["border"], height=1).pack(fill="x", padx=32, pady=(0, 12))

        def card(parent):
            f = tk.Frame(parent, bg=COLORS["bg2"], padx=20, pady=14)
            f.pack(fill="x", padx=32, pady=(0, 10))
            return f

        def toggle(parent, label, attr, hint=""):
            row = tk.Frame(parent, bg=COLORS["bg2"])
            row.pack(fill="x", pady=5)
            lf = tk.Frame(row, bg=COLORS["bg2"])
            lf.pack(side="left", fill="x", expand=True)
            tk.Label(lf, text=label, bg=COLORS["bg2"], fg=COLORS["text"],
                     font=("monospace", 12), anchor="w").pack(anchor="w")
            if hint:
                tk.Label(lf, text=hint, bg=COLORS["bg2"], fg=COLORS["subtext"],
                         font=("monospace", 9), anchor="w").pack(anchor="w")
            var = tk.BooleanVar(value=getattr(s.settings, attr))
            self.vars[attr] = (var, bool)
            cb = tk.Checkbutton(row, variable=var, bg=COLORS["bg2"],
                                activebackground=COLORS["bg2"],
                                selectcolor=COLORS["accent"],
                                relief="flat", bd=0, cursor="hand2")
            cb.pack(side="right", padx=4)
            return var

        def time_picker(parent, label, hour_attr, min_attr):
            """HH:MM picker with +/- spinners."""
            row = tk.Frame(parent, bg=COLORS["bg2"])
            row.pack(fill="x", pady=6)
            tk.Label(row, text=label, bg=COLORS["bg2"], fg=COLORS["text"],
                     font=("monospace", 12), width=22, anchor="w").pack(side="left")

            h_var = tk.IntVar(value=getattr(s.settings, hour_attr))
            m_var = tk.IntVar(value=getattr(s.settings, min_attr))
            self.vars[hour_attr] = (h_var, int)
            self.vars[min_attr]  = (m_var, int)

            def spin(var, delta, lo, hi):
                var.set((var.get() + delta) % (hi + 1) if delta > 0
                        else (var.get() + delta) % (hi + 1)
                        if var.get() + delta >= lo
                        else hi)
                _refresh_display()

            def _refresh_display():
                h_lbl.configure(text=f"{h_var.get():02d}")
                m_lbl.configure(text=f"{m_var.get():02d}")

            ctrl = tk.Frame(row, bg=COLORS["bg2"])
            ctrl.pack(side="right")

            def spinner_group(parent, var, lo, hi):
                g = tk.Frame(parent, bg=COLORS["bg2"])
                tk.Button(g, text="▲", bg=COLORS["bg3"] if "bg3" in COLORS else COLORS["bg"],
                          fg=COLORS["subtext"], relief="flat", bd=0,
                          font=("monospace", 8), width=3, cursor="hand2",
                          command=lambda: spin(var, 1, lo, hi),
                          activebackground=COLORS["hover"]).pack()
                lbl = tk.Label(g, text=f"{var.get():02d}",
                               bg=COLORS["bg2"], fg=COLORS["accent2"],
                               font=("monospace", 16, "bold"), width=3)
                lbl.pack()
                tk.Button(g, text="▼", bg=COLORS["bg3"] if "bg3" in COLORS else COLORS["bg"],
                          fg=COLORS["subtext"], relief="flat", bd=0,
                          font=("monospace", 8), width=3, cursor="hand2",
                          command=lambda: spin(var, -1, lo, hi),
                          activebackground=COLORS["hover"]).pack()
                g.pack(side="left", padx=2)
                return lbl

            h_lbl = spinner_group(ctrl, h_var, 0, 23)
            tk.Label(ctrl, text=":", bg=COLORS["bg2"], fg=COLORS["accent2"],
                     font=("monospace", 18, "bold")).pack(side="left", padx=2)
            m_lbl = spinner_group(ctrl, m_var, 0, 59)

        def stepper(parent, label, attr, lo, hi, step=1, hint=""):
            """Integer value with −/+ buttons."""
            row = tk.Frame(parent, bg=COLORS["bg2"])
            row.pack(fill="x", pady=6)
            lf = tk.Frame(row, bg=COLORS["bg2"])
            lf.pack(side="left", fill="x", expand=True)
            tk.Label(lf, text=label, bg=COLORS["bg2"], fg=COLORS["text"],
                     font=("monospace", 12), anchor="w").pack(anchor="w")
            if hint:
                tk.Label(lf, text=hint, bg=COLORS["bg2"], fg=COLORS["subtext"],
                         font=("monospace", 9), anchor="w").pack(anchor="w")
            var = tk.IntVar(value=int(getattr(s.settings, attr)))
            self.vars[attr] = (var, int)
            ctrl = tk.Frame(row, bg=COLORS["bg2"])
            ctrl.pack(side="right")
            val_lbl = tk.Label(ctrl, text=str(var.get()),
                               bg=COLORS["bg2"], fg=COLORS["accent2"],
                               font=("monospace", 16, "bold"), width=5)
            def change(d):
                v = max(lo, min(hi, var.get() + d))
                var.set(v); val_lbl.configure(text=str(v))
            tk.Button(ctrl, text="−", command=lambda: change(-step),
                      bg=COLORS["bg2"], fg=COLORS["accent"], relief="flat", bd=0,
                      font=("monospace", 15, "bold"), width=3, cursor="hand2",
                      activebackground=COLORS["hover"]).pack(side="left", padx=2)
            val_lbl.pack(side="left")
            tk.Button(ctrl, text="+", command=lambda: change(step),
                      bg=COLORS["bg2"], fg=COLORS["accent"], relief="flat", bd=0,
                      font=("monospace", 15, "bold"), width=3, cursor="hand2",
                      activebackground=COLORS["hover"]).pack(side="left", padx=2)

        def radiogroup(parent, attr, options):
            var = tk.StringVar(value=getattr(s.settings, attr, options[0][0]))
            self.vars[attr] = (var, str)
            for val, label in options:
                rb = tk.Radiobutton(parent, text=label, variable=var, value=val,
                                    bg=COLORS["bg2"], fg=COLORS["text"],
                                    selectcolor=COLORS["bg"],
                                    activebackground=COLORS["bg2"],
                                    font=("monospace", 11), anchor="w", cursor="hand2")
                rb.pack(anchor="w", pady=2)
            return var

        # ══════════════════════════════════════════════════════════════════════
        # 1. ORARI
        # ══════════════════════════════════════════════════════════════════════
        section("🕐  Orari")

        c1 = card(inner)
        tk.Label(c1, text="Inizio e fine giornata lavorativa",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 10)).pack(anchor="w", pady=(0, 8))
        time_picker(c1, "🟢  Inizio lavoro", "work_start_hour", "work_start_min")
        time_picker(c1, "🔴  Fine lavoro",   "work_end_hour",   "work_end_min")

        c2 = card(inner)
        tk.Label(c2, text="Pausa pranzo (nessun blocco in questo intervallo)",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 10)).pack(anchor="w", pady=(0, 8))
        time_picker(c2, "🍽️  Inizio pranzo",  "lunch_start_hour", "lunch_start_min")
        time_picker(c2, "🍽️  Fine pranzo",    "lunch_end_hour",   "lunch_end_min")

        # ══════════════════════════════════════════════════════════════════════
        # 2. CICLO LAVORO / PAUSA
        # ══════════════════════════════════════════════════════════════════════
        section("⏱  Ciclo lavoro / pausa")

        c3 = card(inner)
        stepper(c3, "Lavoro prima della pausa", "work_interval_min",
                15, 120, step=5, hint="minuti")
        stepper(c3, "Durata pausa",             "break_duration_min",
                1,  30,  step=1, hint="minuti")
        stepper(c3, "Jolly al giorno",          "jolly_per_day",
                0,  10,  step=1, hint="pause saltabili")

        # ══════════════════════════════════════════════════════════════════════
        # 3. ACQUA & MERENDA
        # ══════════════════════════════════════════════════════════════════════
        section("💧  Acqua & Merenda")

        c4 = card(inner)
        toggle(c4, "Promemoria acqua",   "water_enabled")
        stepper(c4, "Ogni quanto ricordare", "water_interval_min",
                10, 120, step=5, hint="minuti")
        toggle(c4, "Promemoria merenda", "snack_enabled")

        # ══════════════════════════════════════════════════════════════════════
        # 4. AUDIO
        # ══════════════════════════════════════════════════════════════════════
        section("🎵  Audio")

        c5 = card(inner)
        tk.Label(c5, text="Musica di sottofondo durante la pausa",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 10)).pack(anchor="w", pady=(0, 8))
        radiogroup(c5, "ambient_music", [
            ("am_chord", "🎵  Accordo Am (sintetico)"),
            ("forest",   "🌲  Foresta"),
            ("rain",     "🌧️  Pioggia"),
            ("ocean",    "🌊  Oceano"),
            ("none",     "🔕  Solo chime"),
        ])

        # Volume
        vol_row = tk.Frame(c5, bg=COLORS["bg2"])
        vol_row.pack(fill="x", pady=(12, 4))
        tk.Label(vol_row, text="Volume", bg=COLORS["bg2"], fg=COLORS["text"],
                 font=("monospace", 12)).pack(side="left")
        vol_var = tk.DoubleVar(value=float(s.settings.ambient_volume))
        self.vars["ambient_volume"] = (vol_var, float)
        vol_ctrl = tk.Frame(vol_row, bg=COLORS["bg2"])
        vol_ctrl.pack(side="right")
        vol_lbl = tk.Label(vol_ctrl, text=f"{int(vol_var.get()*100)}%",
                           bg=COLORS["bg2"], fg=COLORS["accent2"],
                           font=("monospace", 14, "bold"), width=6)
        def set_vol(d):
            v = max(0.0, min(1.0, round(vol_var.get()+d, 2)))
            vol_var.set(v); vol_lbl.configure(text=f"{int(v*100)}%")
            draw_vbar()
        tk.Button(vol_ctrl, text="−", command=lambda: set_vol(-0.05),
                  bg=COLORS["bg2"], fg=COLORS["accent"], relief="flat", bd=0,
                  font=("monospace", 15, "bold"), width=3, cursor="hand2",
                  activebackground=COLORS["hover"]).pack(side="left", padx=2)
        vol_lbl.pack(side="left", padx=4)
        tk.Button(vol_ctrl, text="+", command=lambda: set_vol(0.05),
                  bg=COLORS["bg2"], fg=COLORS["accent"], relief="flat", bd=0,
                  font=("monospace", 15, "bold"), width=3, cursor="hand2",
                  activebackground=COLORS["hover"]).pack(side="left", padx=2)
        vol_bar = tk.Canvas(c5, height=8, bg=COLORS["border"],
                            highlightthickness=0, bd=0)
        vol_bar.pack(fill="x", pady=(0, 6))
        def draw_vbar():
            vol_bar.delete("all")
            vol_bar.update_idletasks()
            W = vol_bar.winfo_width() or 500
            vol_bar.create_rectangle(0,0,int(W*vol_var.get()),8,
                                     fill=COLORS["accent"], outline="")
        vol_bar.after(150, draw_vbar)

        toggle(c5, "🔔  Chime a ogni esercizio", "chime_enabled",
               "suono breve a ogni cambio")

        # ══════════════════════════════════════════════════════════════════════
        # 5. TEMA
        # ══════════════════════════════════════════════════════════════════════
        section("🎨  Tema")

        c6 = card(inner)
        tk.Label(c6, text="Si applica alla prossima apertura della finestra.",
                 bg=COLORS["bg2"], fg=COLORS["subtext"],
                 font=("monospace", 10)).pack(anchor="w", pady=(0, 8))
        radiogroup(c6, "theme", theme_options())

        # ══════════════════════════════════════════════════════════════════════
        # 6. SCHERMO DEL BLOCCO
        # ══════════════════════════════════════════════════════════════════════
        section("🖥️  Schermo del blocco")

        if self._detect_fractional_scaling():
            warn = tk.Frame(inner, bg="#3D2A14")
            warn.pack(fill="x", padx=32, pady=(0, 10))
            tk.Label(warn, text="⚠️  Scala frazionaria rilevata",
                     bg="#3D2A14", fg="#FFD166",
                     font=("monospace", 11, "bold")).pack(anchor="w", padx=14, pady=(10, 2))
            tk.Label(warn,
                     text="Con scala 125%/150% il blocco multi-schermo può apparire male.\n"
                          "Consiglio: disabilita 'Blocca tutti gli schermi', oppure usa\n"
                          "scala 100% o 200% su entrambi i monitor.",
                     bg="#3D2A14", fg="#E8D5B0",
                     font=("monospace", 10), justify="left").pack(anchor="w", padx=14, pady=(0, 10))

        c7 = card(inner)
        toggle(c7, "Blocca tutti gli schermi", "lock_all_monitors",
               "se disabilitato, blocca solo il monitor scelto")

        tk.Label(c7, text="Monitor con l'interfaccia di pausa",
                 bg=COLORS["bg2"], fg=COLORS["text"],
                 font=("monospace", 12)).pack(anchor="w", pady=(10, 4))
        mon_opts = [("primary", "🎯  Monitor primario")]
        try:
            import subprocess as _sp, re as _re
            _xr = _sp.run(["xrandr","--query"], capture_output=True, text=True, timeout=3)
            for _l in _xr.stdout.splitlines():
                if " connected" in _l:
                    _n = _l.split()[0]
                    _isp = "primary" in _l
                    _m = _re.search(r'(\d+)x(\d+)', _l)
                    _res = f" — {_m.group(0)}" if _m else ""
                    mon_opts.append((_n, f"🖵  {_n}{_res}{' (primario)' if _isp else ''}"))
        except Exception:
            pass
        radiogroup(c7, "ui_monitor", mon_opts)

        # ══════════════════════════════════════════════════════════════════════
        # 7. WEBCAM
        # ══════════════════════════════════════════════════════════════════════
        section("📷  Webcam")

        c8 = card(inner)
        toggle(c8, "Rileva movimento durante la pausa", "webcam_enabled",
               "richiede opencv-python nel venv")

        # ══════════════════════════════════════════════════════════════════════
        # SALVA
        # ══════════════════════════════════════════════════════════════════════
        btn_row = tk.Frame(inner, bg=COLORS["bg"])
        btn_row.pack(fill="x", padx=32, pady=(28, 36))

        def save():
            errors = []
            for attr, (var, typ) in self.vars.items():
                try:
                    val = var.get() if typ in (bool, float) else typ(var.get())
                    setattr(s.settings, attr, val)
                except (ValueError, tk.TclError):
                    errors.append(attr)
            if errors:
                messagebox.showerror("Errore", f"Valori non validi:\n{', '.join(errors)}")
                return
            s.save()
            if self._timer_ref:
                self._timer_ref.reschedule()
            save_btn.configure(text="✅  Salvato!", bg=COLORS["success"],
                               fg=COLORS["bg"])
            btn_row.after(1800, lambda: save_btn.configure(
                text="💾  Salva", bg=COLORS["accent"], fg=COLORS["bg"]))

        save_btn = tk.Button(btn_row, text="💾  Salva",
                             command=save, bg=COLORS["accent"], fg=COLORS["bg"],
                             font=("monospace", 14, "bold"), relief="flat", bd=0,
                             padx=32, pady=12, cursor="hand2",
                             activebackground=COLORS["hover"])
        save_btn.pack(side="left")
        tk.Label(btn_row, text="Le modifiche hanno effetto immediato.",
                 bg=COLORS["bg"], fg=COLORS["subtext"],
                 font=("monospace", 10)).pack(side="left", padx=16)



        return frame


    # ── TAB: TEST ─────────────────────────────────────────────────────────────
    def _build_test(self, parent):
        frame = tk.Frame(parent, bg=COLORS["bg"])

        tk.Label(frame, text="🧪  Strumenti di test",
                 bg=COLORS["bg"], fg=COLORS["accent"],
                 font=("monospace", 16, "bold")).pack(padx=32, pady=(26, 4), anchor="w")
        tk.Label(frame, text="Testa ogni componente senza aspettare i timer.",
                 bg=COLORS["bg"], fg=COLORS["subtext"],
                 font=("monospace", 12)).pack(padx=32, pady=(0, 18), anchor="w")
        tk.Frame(frame, bg=COLORS["border"], height=1).pack(fill="x", padx=32, pady=(0, 14))

        def test_row(title, desc, btn_label, cmd, style="primary"):
            row = tk.Frame(frame, bg=COLORS["bg2"],
                           highlightthickness=1, highlightbackground=COLORS["border"],
                           padx=22, pady=16)
            row.pack(fill="x", padx=32, pady=7)
            info = tk.Frame(row, bg=COLORS["bg2"])
            info.pack(side="left", fill="both", expand=True)
            tk.Label(info, text=title, bg=COLORS["bg2"], fg=COLORS["text"],
                     font=("monospace", 13, "bold"), anchor="w").pack(anchor="w")
            tk.Label(info, text=desc, bg=COLORS["bg2"], fg=COLORS["subtext"],
                     font=("monospace", 11), anchor="w").pack(anchor="w")
            _btn(row, btn_label, cmd, style=style).pack(side="right")

        def do_lock():
            if self._timer_ref:
                self._timer_ref.lock_screen._build_window()

        def do_quick_lock():
            orig = self.state.settings.break_duration_min
            self.state.settings.break_duration_min = 1
            if self._timer_ref:
                self._timer_ref.lock_screen._build_window()
            frame.after(5000, lambda: setattr(
                self.state.settings, "break_duration_min", orig))

        def do_water():
            if self._timer_ref:
                self._timer_ref.notifier.water_reminder()

        def do_snack():
            if self._timer_ref:
                self._timer_ref.notifier.snack_reminder()

        def do_reset_jolly():
            self.state.jolly_remaining = self.state.settings.jolly_per_day
            self.state.today_stats.jolly_used = 0
            self.state.save()
            messagebox.showinfo("Jolly ripristinati",
                                f"Jolly riportati a {self.state.jolly_remaining}.")

        def do_reset_stats():
            if messagebox.askyesno("Conferma", "Azzera tutte le statistiche di oggi?"):
                from modules.state import DayStats
                self.state.today_stats = DayStats(date=str(date.today()))
                self.state.jolly_remaining = self.state.settings.jolly_per_day
                self.state.save()
                messagebox.showinfo("Reset", "Statistiche azzerate.")

        test_row("☕  Schermata di blocco",
                 "Apre la lock screen completa (durata configurata).",
                 "▶  Avvia blocco", do_lock, "primary")
        test_row("⚡  Blocco rapido (1 min)",
                 "Come sopra ma dura solo 1 minuto — per testare il flusso.",
                 "▶  Avvia (1 min)", do_quick_lock, "warning")
        test_row("💧  Promemoria acqua",
                 "Invia la notifica desktop adesso.",
                 "▶  Invia", do_water, "default")
        test_row("🍎  Promemoria merenda",
                 "Invia la notifica desktop adesso.",
                 "▶  Invia", do_snack, "default")
        test_row("🃏  Ripristina jolly",
                 "Riporta i jolly di oggi al massimo configurato.",
                 "🔄  Ripristina", do_reset_jolly, "warning")
        test_row("🗑️  Azzera statistiche",
                 "Resetta pause, jolly, acqua e movimento a zero.",
                 "🗑️  Azzera", do_reset_stats, "danger")

        return frame
