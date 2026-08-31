"""
LockScreen - Full-screen break window
  - Covers ALL monitors, UI on primary screen
  - Countdown + exercises with calibrated timings
  - Static exercises skip webcam movement check
  - Webcam frame-diff movement detection
  - Water reminder slide mid-break
  - Relaxing ambient sound via pygame (optional)
  - Jolly skip button
"""

import tkinter as tk
import threading
import time
import subprocess
import shutil
import os
from modules.state import AppState
from modules.notification import NotificationManager

# ── EXERCISES ──────────────────────────────────────────────────────────────────
# static=True → webcam movement check disabled for this exercise
EXERCISES = [
    {
        "emoji": "🦒",
        "name": "Collo — Su e giù",
        "desc": "Inclina lentamente la testa in avanti,\npoi all'indietro. Ripeti 5 volte lentamente.",
        "duration": 30,
        "static": False,
    },
    {
        "emoji": "🔄",
        "name": "Collo — Rotazioni laterali",
        "desc": "Ruota la testa verso destra, tieni 5 sec.\nTorna al centro, poi verso sinistra, 5 sec.",
        "duration": 25,
        "static": False,
    },
    {
        "emoji": "🙆",
        "name": "Spalle — Rotazioni",
        "desc": "Ruota entrambe le spalle in avanti 5 volte,\npoi all'indietro 5 volte. Lento e ampio.",
        "duration": 25,
        "static": False,
    },
    {
        "emoji": "🤸",
        "name": "Busto — Torsione",
        "desc": "Seduto, ruota il busto a destra tenendo\nlo schienale. 10 sec. Poi cambia lato.",
        "duration": 25,
        "static": False,
    },
    {
        "emoji": "🖐️",
        "name": "Polsi — Stretching",
        "desc": "Estendi il braccio, piega il polso verso il basso\ncon l'altra mano. 10 sec. Ripeti.",
        "duration": 25,
        "static": False,
    },
    {
        "emoji": "💧",
        "name": "Bevi acqua!",
        "desc": "Alzati, vai a prendere un bicchiere d'acqua.\nIdratarsi regolarmente migliora concentrazione ed energia.",
        "duration": 30,
        "static": True,   # no movement expected while walking
    },
    {
        "emoji": "👁️",
        "name": "Occhi — Regola 20-20-20",
        "desc": "Guarda un punto lontano (~6 metri)\nper almeno 20 secondi. Lascia riposare gli occhi.",
        "duration": 25,
        "static": True,   # looking away = no movement at desk
    },
    {
        "emoji": "🧘",
        "name": "Respiro profondo",
        "desc": "Inspira per 4 sec, trattieni 4 sec,\nesala lentamente per 6 sec. Ripeti 3 volte.",
        "duration": 35,
        "static": True,   # breathing exercise = minimal movement
    },
    {
        "emoji": "🦵",
        "name": "Gambe — Sollevamento",
        "desc": "Seduto, solleva una gamba tesa per 10 sec.\nAbbassala lentamente. Ripeti con l'altra.",
        "duration": 25,
        "static": False,
    },
    {
        "emoji": "✊",
        "name": "Mani — Stringi e apri",
        "desc": "Stringi forte i pugni per 5 sec,\npoi apri le dita al massimo. Ripeti 5 volte.",
        "duration": 20,
        "static": False,
    },
]

from modules.themes import get_theme, DEFAULT_THEME, draw_background

# COLORS is a live dict updated from the active theme when a break starts.
COLORS = dict(get_theme(DEFAULT_THEME))


def _apply_theme(name):
    """Update the global COLORS dict in place from a theme name."""
    COLORS.clear()
    COLORS.update(get_theme(name))



class AudioEngine:
    """
    Ambient music + per-exercise chimes using pygame.

    Ambient modes (set via state.settings.ambient_music):
      am_chord  — soft Am synthesised pad (default)
      forest    — synthesised forest: crickets + wind + birds
      rain      — synthesised rain noise + distant thunder
      ocean     — low wave rumble + seagull-ish overtones
      none      — no background, chimes only
    """

    CHIME_FREQS = {
        "water":  (528, 660),
        "static": (396, 528),
        "active": (440, 554),
    }

    MUSIC_LABELS = {
        "am_chord": "🎵  Accordo Am (sintetico)",
        "forest":   "🌲  Foresta",
        "rain":     "🌧️  Pioggia",
        "ocean":    "🌊  Oceano",
        "none":     "🔕  Solo chime",
    }

    def __init__(self, state):
        self.state = state
        self._running = False
        self._thread = None
        self._pygame_ok = False
        self._mixer_ready = threading.Event()  # set when mixer is fully initialized

    def start(self):
        self._running = True
        self._thread = threading.Thread(target=self._init_and_run, daemon=True)
        self._thread.start()

    def stop(self):
        self._running = False
        if self._pygame_ok:
            try:
                import pygame
                if pygame.mixer.get_init() is not None:
                    pygame.mixer.stop()
                    pygame.mixer.quit()
            except Exception:
                pass
        self._pygame_ok = False

    def play_chime(self, exercise: dict):
        if not self.state.settings.chime_enabled:
            return
        threading.Thread(target=self._chime_when_ready, args=(exercise,), daemon=True).start()

    def _chime_when_ready(self, exercise: dict):
        """Wait up to 3s for mixer to be ready, then play the chime."""
        self._mixer_ready.wait(timeout=3.0)
        if not self._pygame_ok:
            return
        self._chime(exercise)

    # ── internals ──────────────────────────────────────────────────────────
    def _init_and_run(self):
        try:
            import pygame
            import numpy as np

            # Robust mixer init — some Linux audio backends need a retry and
            # an explicit pygame.init() before the mixer becomes usable.
            ok = False
            for attempt in range(3):
                try:
                    pygame.mixer.quit()
                except Exception:
                    pass
                try:
                    pygame.init()
                    pygame.mixer.init(frequency=44100, size=-16, channels=2, buffer=1024)
                    if pygame.mixer.get_init() is not None:
                        ok = True
                        break
                except Exception as e:
                    print(f"[Audio] init tentativo {attempt+1}: {e}")
                time.sleep(0.3)

            if not ok:
                print("[Audio] Impossibile inizializzare il mixer audio.")
                self._pygame_ok = False
                return

            self._pygame_ok = True
            self._mixer_ready.set()  # signal that mixer is ready for chimes

            # Pre-generate all modes so switching is instant
            sounds = {}
            for m in ("am_chord", "forest", "rain", "ocean"):
                try:
                    if pygame.mixer.get_init() is None:
                        break
                    wave = self._generate(m, sr=44100, loop_sec=10)
                    stereo = np.column_stack([wave * 0.9, wave])
                    stereo = np.clip(stereo * 32767, -32768, 32767).astype(np.int16)
                    sounds[m] = pygame.sndarray.make_sound(stereo)
                except Exception as e:
                    print(f"[Audio] Generazione {m}: {e}")

            current_mode = self.state.settings.ambient_music
            vol = float(self.state.settings.ambient_volume)
            current_sound = None

            def start_mode(mode, volume):
                nonlocal current_sound
                if current_sound:
                    current_sound.stop()
                    current_sound = None
                if mode in sounds:
                    current_sound = sounds[mode]
                    current_sound.set_volume(volume)
                    current_sound.play(loops=-1)

            if current_mode != "none":
                start_mode(current_mode, vol)

            while self._running:
                new_mode = self.state.settings.ambient_music
                new_vol  = float(self.state.settings.ambient_volume)

                # Mode changed — switch sound
                if new_mode != current_mode:
                    current_mode = new_mode
                    if new_mode == "none":
                        if current_sound:
                            current_sound.stop()
                            current_sound = None
                    else:
                        start_mode(new_mode, new_vol)

                # Volume changed
                elif abs(new_vol - vol) > 0.01:
                    if current_sound:
                        current_sound.set_volume(new_vol)

                vol = new_vol
                time.sleep(0.3)

            if current_sound:
                current_sound.stop()
            pygame.mixer.quit()

        except ImportError:
            print("[Audio] pygame non installato. Installa con: pip install pygame")
        except Exception as e:
            print(f"[Audio] {e}")

    def _generate(self, mode: str, sr: int, loop_sec: int):
        import numpy as np
        N = sr * loop_sec
        t = np.linspace(0, loop_sec, N, endpoint=False)
        rng = np.random.default_rng(42)

        def pink_noise(n):
            """True pink noise via Voss-McCartney algorithm approximation."""
            f = np.fft.rfftfreq(n)
            f[0] = 1  # avoid div by zero
            power = 1.0 / np.sqrt(f)
            power[0] = 0
            phases = rng.uniform(0, 2 * np.pi, len(f))
            spectrum = power * np.exp(1j * phases)
            noise = np.fft.irfft(spectrum, n)
            return noise / (np.max(np.abs(noise)) + 1e-9)

        def lowpass(sig, cutoff_hz, passes=2):
            """Simple IIR lowpass."""
            rc = 1.0 / (2 * np.pi * cutoff_hz)
            dt = 1.0 / sr
            alpha = dt / (rc + dt)
            out = sig.copy()
            for _ in range(passes):
                for i in range(1, len(out)):
                    out[i] = alpha * out[i] + (1 - alpha) * out[i-1]
            return out

        def highpass(sig, cutoff_hz):
            rc = 1.0 / (2 * np.pi * cutoff_hz)
            dt = 1.0 / sr
            alpha = rc / (rc + dt)
            out = np.zeros_like(sig)
            out[0] = sig[0]
            for i in range(1, len(sig)):
                out[i] = alpha * (out[i-1] + sig[i] - sig[i-1])
            return out

        if mode == "am_chord":
            # Soft sine pad — C major 7: C3+E3+G3+B3, very gentle
            # Add slight detuning per voice for warmth
            detune = [0, 0.3, -0.2, 0.15, -0.1]
            freqs   = [130.81, 164.81, 196.00, 246.94, 261.63]
            amps    = [0.22,   0.18,   0.16,   0.12,   0.08]
            # Slow volume swell LFO (8 sec cycle)
            swell = 0.85 + 0.15 * np.sin(2 * np.pi * t / 8.0)
            w = sum(
                a * np.sin(2 * np.pi * (f + d) * t)
                for a, f, d in zip(amps, freqs, detune)
            ) * swell
            # Add very faint high harmonic shimmer
            w += 0.03 * np.sin(2 * np.pi * 523.25 * t) * swell

        elif mode == "forest":
            # Pink noise shaped as wind (lowpassed) + mid-range rustle
            wind_base = pink_noise(N)
            wind = lowpass(wind_base, 300) * 0.5
            # Slow wind swell
            wind_lfo = 0.6 + 0.4 * np.sin(2 * np.pi * t / 7.0 + 1.2)
            wind *= wind_lfo
            # Rustling leaves: bandpass around 1.5-4 kHz pink noise
            rustle_raw = pink_noise(N)
            rustle = highpass(lowpass(rustle_raw, 4000), 1200) * 0.18
            rustle_lfo = 0.4 + 0.6 * (0.5 + 0.5 * np.sin(2 * np.pi * t / 3.1))
            rustle *= rustle_lfo
            # Very faint bird-like chirp at irregular intervals
            bird_env = np.zeros(N)
            for pos in [1.0, 3.7, 6.2, 8.9]:
                idx = int(pos * sr)
                span = int(0.25 * sr)
                if idx + span < N:
                    env = np.sin(np.pi * np.linspace(0, 1, span)) ** 2
                    bird_env[idx:idx+span] += env
            bird = np.sin(2 * np.pi * 2800 * t) * bird_env * 0.06
            w = wind + rustle + bird

        elif mode == "rain":
            # Pink noise shaped as rain
            rain_raw = pink_noise(N)
            # Rain: mostly mid-high frequencies
            rain = highpass(rain_raw, 400) * 0.6
            # Slow intensity variation
            rain_lfo = 0.75 + 0.25 * np.sin(2 * np.pi * t / 11.0)
            rain *= rain_lfo
            # Drip-like accents: occasional slightly louder mid-freq bursts
            drip_env = np.zeros(N)
            for pos in [0.8, 2.1, 3.5, 5.0, 6.3, 7.8, 9.2]:
                idx = int(pos * sr)
                span = int(0.08 * sr)
                if idx + span < N:
                    env = np.exp(-15 * np.linspace(0, 1, span))
                    drip_env[idx:idx+span] += env
            drip_noise = pink_noise(N)
            drip = highpass(lowpass(drip_noise, 3000), 800) * drip_env * 0.25
            w = rain + drip

        elif mode == "ocean":
            # Deep wave rumble with slow swell
            wave_lfo = 0.5 + 0.5 * np.sin(2 * np.pi * t / 6.5)
            # Low sub-bass rumble
            sub = np.sin(2 * np.pi * 60 * t) * wave_lfo * 0.30
            sub2 = np.sin(2 * np.pi * 95 * t) * wave_lfo * 0.15
            # White noise surf filtered to "splash" band
            surf_raw = pink_noise(N)
            surf = highpass(lowpass(surf_raw, 1200), 200) * wave_lfo * 0.40
            # Very faint mid hiss (sea spray)
            hiss_raw = rng.uniform(-1, 1, N)
            hiss = highpass(lowpass(hiss_raw, 6000), 3000) * 0.06
            w = sub + sub2 + surf + hiss

        else:
            w = np.zeros(N)

        # Smooth loop edges to avoid click
        fade = min(sr * 2, N // 4)
        w[:fade]  *= np.linspace(0, 1, fade)
        w[-fade:] *= np.linspace(1, 0, fade)
        # Normalise to 0.85 peak
        peak = np.max(np.abs(w))
        if peak > 0:
            w = w / peak * 0.85
        return w

    def _chime(self, exercise: dict):
        try:
            import pygame, numpy as np
            if not self._pygame_ok:
                return
            # Mixer may have been quit by stop() — bail out safely
            if pygame.mixer.get_init() is None:
                return
            sr, dur = 44100, 0.65
            t = np.linspace(0, dur, int(sr * dur), endpoint=False)
            if exercise.get("emoji") == "💧":
                freqs = self.CHIME_FREQS["water"]
            elif exercise.get("static"):
                freqs = self.CHIME_FREQS["static"]
            else:
                freqs = self.CHIME_FREQS["active"]
            wave = sum(0.28 * np.sin(2 * np.pi * f * t) for f in freqs)
            env = np.exp(-5 * t / dur)
            wave = wave * env
            stereo = np.column_stack([wave, wave])
            stereo = np.clip(stereo * 32767, -32768, 32767).astype(np.int16)
            snd = pygame.sndarray.make_sound(stereo)
            snd.set_volume(0.75)
            snd.play()
            time.sleep(dur + 0.1)
        except Exception as e:
            print(f"[Chime] {e}")


class LockScreen:
    def __init__(self, root: tk.Tk, state: AppState, notifier: NotificationManager):
        self.root = root
        self.state = state
        self.notifier = notifier
        self.window = None          # primary screen window
        self._overlays = []         # blank windows on other screens
        self._all_monitor_wins = []
        self._break_duration = 0
        self._elapsed = 0
        self._current_exercise = 0
        self._exercise_elapsed = 0
        self._running = False
        self._webcam_thread = None
        self._movement_score = 0
        self._audio = None

    def show(self):
        self.root.after(0, self._build_window)

    # ── BUILD ──────────────────────────────────────────────────────────────────
    def _build_window(self):
        if self.window and self.window.winfo_exists():
            return

        # Apply the user's chosen theme
        _apply_theme(getattr(self.state.settings, "theme", "teal"))

        self.state.is_on_break = True
        self._break_duration = self.state.settings.break_duration_min * 60
        self._elapsed = 0
        self._current_exercise = 0
        self._exercise_elapsed = 0
        self._running = True
        self._movement_score = 0

        monitors = self._get_all_monitors()
        if not monitors:
            monitors = [(1920, 1080, 0, 0, True, "default")]

        lock_all = getattr(self.state.settings, "lock_all_monitors", True)

        # Determine which monitor holds the main UI
        ui_pref = getattr(self.state.settings, "ui_monitor", "primary")
        target = None
        if ui_pref not in ("primary", "left", "right", "center"):
            target = next((m for m in monitors if m[5] == ui_pref), None)
        elif ui_pref == "left":
            target = min(monitors, key=lambda m: m[2])
        elif ui_pref == "right":
            target = max(monitors, key=lambda m: m[2])
        if target is None:
            target = next((m for m in monitors if m[4]), monitors[0])

        self._primary_w = target[0]
        self._primary_h = target[1]
        print(f"[LockScreen] UI su {target[5]}  lock_all={lock_all}")

        # Build one window per monitor (or just the UI monitor)
        self._all_monitor_wins = []
        wins_to_make = monitors if lock_all else [target]
        theme = get_theme(getattr(self.state.settings, "theme", "teal"))
        ui_frame = None   # Frame that hosts the main UI widgets

        for (mw, mh, mx, my, is_primary, name) in wins_to_make:
            win = tk.Toplevel(self.root)
            win.title(f"WorkBreak-{name}")
            win.configure(bg=COLORS["bg"])
            win.overrideredirect(True)
            win.attributes("-topmost", True)
            win.protocol("WM_DELETE_WINDOW", lambda: None)
            win.geometry(f"{mw}x{mh}+{mx}+{my}")
            win.update_idletasks()
            win.update()

            # Background canvas — exact pixel size, placed at 0,0
            bg_canvas = tk.Canvas(win, width=mw, height=mh,
                                  highlightthickness=0, bd=0,
                                  bg=COLORS["bg"])
            bg_canvas.place(x=0, y=0, width=mw, height=mh)
            try:
                draw_background(bg_canvas, theme, mw, mh)
            except Exception as e:
                print(f"[BG] {e}")

            is_ui = (name == target[5])
            self._all_monitor_wins.append((win, mw, mh, mx, my, is_ui))

            if is_ui:
                # UI Frame sits on top of canvas, exact monitor size
                ui_frame = tk.Frame(win, bg=COLORS["bg"], width=mw, height=mh)
                ui_frame.place(x=0, y=0, width=mw, height=mh)
                ui_frame.pack_propagate(False)
            else:
                # Secondary monitor: just a centered message on top of canvas
                tk.Label(
                    win,
                    text="\u2615\n\nPausa in corso\nsull'altro schermo",
                    bg=COLORS["bg"], fg=COLORS["subtext"],
                    font=("monospace", 22), justify="center"
                ).place(relx=0.5, rely=0.5, anchor="center")

        # The UI window
        self.window = next(
            (wi[0] for wi in self._all_monitor_wins if wi[5]),
            self._all_monitor_wins[0][0]
        )

        self._pin_loop()

        # Audio first so mixer is initialising before the first chime
        self._audio = AudioEngine(self.state)
        self._audio.start()

        # _setup_ui uses pack — must receive a Frame, not a Canvas
        ui_parent = ui_frame if ui_frame is not None else self.window
        self._setup_ui(ui_parent)
        self.window.update_idletasks()
        self.window.update()
        self.window.after(200, self._tick)

        if self.state.settings.webcam_enabled:
            self._webcam_thread = threading.Thread(target=self._run_webcam, daemon=True)
            self._webcam_thread.start()

    def _pin_loop(self):
        """Keep every lock window pinned to its monitor geometry."""
        if not self._running:
            return
        try:
            for (win, mw, mh, mx, my, is_ui) in self._all_monitor_wins:
                if not win.winfo_exists():
                    continue
                if abs(win.winfo_x() - mx) > 2 or abs(win.winfo_y() - my) > 2:
                    win.geometry(f"{mw}x{mh}+{mx}+{my}")
            if self.window and self.window.winfo_exists():
                self.window.after(400, self._pin_loop)
        except Exception as e:
            print(f"[pin] {e}")

    def _get_all_monitors(self):
        """Return list of (w, h, x, y, is_primary, name) from xrandr.
        Works reliably when monitors use 100%/200% (integer) scaling.
        Fractional scaling (125%/150%) is not well supported by XWayland;
        in that case the user is advised to lock only the primary monitor."""
        import re
        monitors = []
        try:
            result = subprocess.run(["xrandr", "--query"],
                                    capture_output=True, text=True, timeout=3)
            for line in result.stdout.splitlines():
                if " connected" not in line:
                    continue
                is_primary = "primary" in line
                name = line.split()[0]
                m = re.search(r'(\d+)x(\d+)\+(\d+)\+(\d+)', line)
                if m:
                    monitors.append((int(m.group(1)), int(m.group(2)),
                                     int(m.group(3)), int(m.group(4)),
                                     is_primary, name))
                    print(f"[Monitor] {'PRIMARY' if is_primary else 'secondary'} "
                          f"{name}: {m.group(0)}")
        except Exception as e:
            print(f"[Monitor] xrandr error: {e}")
        monitors.sort(key=lambda m: (0 if m[4] else 1))
        return monitors

    # ── UI SETUP ───────────────────────────────────────────────────────────────
    def _setup_ui(self, w):
        # ── Top bar ────────────────────────────────────────────
        top = tk.Frame(w, bg=COLORS["bg"])
        top.pack(side="top", fill="x", padx=48, pady=(32, 0))

        tk.Label(top, text="W O R K B R E A K   ·   P A U S A",
                 bg=COLORS["bg"], fg=COLORS["subtext"],
                 font=("monospace", 11, "bold")).pack(side="left")

        self.jolly_label = tk.Label(
            top, text=f"🃏  {self.state.jolly_remaining} jolly rimasti",
            bg=COLORS["bg"], fg=COLORS["accent2"],
            font=("monospace", 12, "bold")
        )
        self.jolly_label.pack(side="right")

        # ── Center ─────────────────────────────────────────────
        center = tk.Frame(w, bg=COLORS["bg"])
        center.pack(side="top", expand=True, fill="both", padx=80)

        self.time_label = tk.Label(
            center, text="5:00",
            bg=COLORS["bg"], fg=COLORS["accent"],
            font=("monospace", 88, "bold"),
            anchor="center"
        )
        self.time_label.pack(fill="x", pady=(16, 0))

        self.progress_canvas = tk.Canvas(
            center, height=6, bg=COLORS["bg2"],
            highlightthickness=0, bd=0
        )
        self.progress_canvas.pack(fill="x", pady=(4, 20))

        # Exercise card
        self.card = tk.Frame(center, bg=COLORS["bg2"],
                             highlightthickness=1, highlightbackground=COLORS["border"],
                             padx=40, pady=28)
        self.card.pack(fill="x")

        ex_top = tk.Frame(self.card, bg=COLORS["bg2"])
        ex_top.pack(fill="x")

        self.ex_emoji = tk.Label(ex_top, text="🧘", bg=COLORS["bg2"],
                                  fg=COLORS["text"], font=("Segoe UI Emoji", 36))
        self.ex_emoji.pack(side="left", padx=(0, 16))

        ex_text = tk.Frame(ex_top, bg=COLORS["bg2"])
        ex_text.pack(side="left", fill="both", expand=True)

        self.ex_name = tk.Label(ex_text, text="", bg=COLORS["bg2"],
                                 fg=COLORS["accent"], font=("monospace", 17, "bold"),
                                 anchor="w")
        self.ex_name.pack(fill="x")

        self.ex_desc = tk.Label(ex_text, text="", bg=COLORS["bg2"],
                                 fg=COLORS["text"], font=("sans-serif", 13),
                                 anchor="w", justify="left")
        self.ex_desc.pack(fill="x", pady=(4, 0))

        self.ex_bar = tk.Canvas(self.card, height=4, bg=COLORS["border"],
                                 highlightthickness=0, bd=0)
        self.ex_bar.pack(fill="x", pady=(14, 0))

        # Webcam row
        cam_row = tk.Frame(center, bg=COLORS["bg"])
        cam_row.pack(pady=(14, 0))

        self.cam_label = tk.Label(
            cam_row, text="📷  Webcam: in attesa…",
            bg=COLORS["bg"], fg=COLORS["subtext"],
            font=("monospace", 11)
        )
        self.cam_label.pack()

        self.movement_bar = tk.Canvas(
            cam_row, height=8, width=260,
            bg=COLORS["border"], highlightthickness=0, bd=0
        )
        self.movement_bar.pack(pady=(5, 0))

        # ── Bottom bar ─────────────────────────────────────────
        bottom = tk.Frame(w, bg=COLORS["bg"])
        bottom.pack(side="bottom", fill="x", padx=80, pady=(0, 36))

        tk.Button(
            bottom, text="📅  Sono in riunione",
            bg=COLORS["bg2"], fg=COLORS["subtext"],
            activebackground=COLORS["border"],
            font=("monospace", 11), relief="flat", bd=0,
            padx=14, pady=8, cursor="hand2",
            command=self._toggle_meeting
        ).pack(side="left")

        self.jolly_btn = tk.Button(
            bottom,
            text=f"🃏  Usa jolly  ({self.state.jolly_remaining} rimasti)",
            bg=COLORS["accent2"], fg="#1A1A2E",
            activebackground="#FFC233",
            font=("monospace", 12, "bold"),
            relief="flat", bd=0, padx=24, pady=10, cursor="hand2",
            command=self._use_jolly
        )
        self.jolly_btn.pack(side="right")

        if self.state.jolly_remaining == 0:
            self.jolly_btn.configure(
                state="disabled", bg=COLORS["border"],
                fg=COLORS["subtext"], text="🚫  Nessun jolly rimasto"
            )

        self._update_exercise_display()

    # ── TICK ───────────────────────────────────────────────────────────────────
    def _tick(self):
        if not self._running or not self.window or not self.window.winfo_exists():
            return

        self._elapsed += 1
        self._exercise_elapsed += 1
        remaining = self._break_duration - self._elapsed

        mins, secs = divmod(max(0, remaining), 60)
        self.time_label.configure(text=f"{mins}:{secs:02d}")
        self._draw_progress_bar()

        ex = EXERCISES[self._current_exercise]
        if self._exercise_elapsed >= ex["duration"]:
            self._exercise_elapsed = 0
            self._current_exercise = (self._current_exercise + 1) % len(EXERCISES)
            self._update_exercise_display()
        else:
            self._draw_exercise_bar(ex)

        if remaining <= 0:
            self._finish_break()
            return

        self.window.after(1000, self._tick)

    # ── DRAW ───────────────────────────────────────────────────────────────────
    def _draw_progress_bar(self):
        c = self.progress_canvas
        c.update_idletasks()
        W = c.winfo_width()
        if W < 2:
            W = (self._primary_w - 160) if getattr(self, "_primary_w", 0) else 800
        c.delete("all")
        c.create_rectangle(0, 0, W, 6, fill=COLORS["bg2"], outline="")
        pct = self._elapsed / self._break_duration
        c.create_rectangle(0, 0, int(W * pct), 6, fill=COLORS["accent"], outline="")

    def _draw_exercise_bar(self, ex):
        c = self.ex_bar
        c.update_idletasks()
        W = c.winfo_width()
        if W < 2:
            W = (self._primary_w - 240) if getattr(self, "_primary_w", 0) else 600
        c.delete("all")
        c.create_rectangle(0, 0, W, 4, fill=COLORS["border"], outline="")
        pct = self._exercise_elapsed / ex["duration"]
        c.create_rectangle(0, 0, int(W * pct), 4, fill=COLORS["accent2"], outline="")

    def _update_exercise_display(self):
        if not self.window or not self.window.winfo_exists():
            return
        ex = EXERCISES[self._current_exercise]
        if self._audio:
            self._audio.play_chime(ex)
        # Water slide gets a blue accent
        is_water = ex["emoji"] == "💧"
        accent = COLORS["water"] if is_water else COLORS["accent"]
        self.ex_emoji.configure(text=ex["emoji"])
        self.ex_name.configure(text=ex["name"], fg=accent)
        self.ex_desc.configure(text=ex["desc"])
        self.card.configure(
            highlightbackground=COLORS["water"] if is_water else COLORS["border"]
        )
        # If static exercise, hide movement bar
        if ex.get("static"):
            self.cam_label.configure(
                text="⏸  Rilevamento in pausa (esercizio statico)",
                fg=COLORS["subtext"]
            )
            self.movement_bar.delete("all")
        elif self.state.settings.webcam_enabled:
            self.cam_label.configure(text="📷  Webcam attiva — muoviti!", fg=COLORS["accent"])

    # ── WEBCAM ─────────────────────────────────────────────────────────────────
    def _run_webcam(self):
        try:
            import cv2
        except ImportError:
            self._update_cam_status("📷  opencv non installato", COLORS["subtext"])
            return

        cap = cv2.VideoCapture(0)
        if not cap.isOpened():
            self._update_cam_status("📷  Webcam non disponibile", COLORS["subtext"])
            return

        self._update_cam_status("📷  Webcam attiva — muoviti!", COLORS["accent"])

        pose_ctx = None
        use_framediff = True

        try:
            import mediapipe as mp
            if hasattr(mp, 'solutions') and hasattr(mp.solutions, 'pose'):
                mp_pose = mp.solutions.pose
                pose_ctx = mp_pose.Pose(min_detection_confidence=0.5,
                                        min_tracking_confidence=0.5)
                KEY_JOINTS = [
                    mp_pose.PoseLandmark.LEFT_SHOULDER,
                    mp_pose.PoseLandmark.RIGHT_SHOULDER,
                    mp_pose.PoseLandmark.LEFT_WRIST,
                    mp_pose.PoseLandmark.RIGHT_WRIST,
                    mp_pose.PoseLandmark.LEFT_HIP,
                    mp_pose.PoseLandmark.RIGHT_HIP,
                ]
                use_framediff = False
        except Exception:
            pass

        try:
            prev_data = None
            movement_sum = 0.0
            frame_count = 0

            while self._running:
                # Skip detection during static exercises
                current_ex = EXERCISES[self._current_exercise]
                if current_ex.get("static"):
                    time.sleep(0.5)
                    continue

                ret, frame = cap.read()
                if not ret:
                    break
                frame_count += 1

                if use_framediff:
                    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
                    gray = cv2.GaussianBlur(gray, (21, 21), 0)
                    if prev_data is not None:
                        diff = cv2.absdiff(prev_data, gray)
                        movement_sum += float(diff.mean())
                    prev_data = gray
                else:
                    frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
                    results = pose_ctx.process(frame_rgb)
                    if results.pose_landmarks and prev_data is not None:
                        lm = results.pose_landmarks.landmark
                        prev_lm = prev_data
                        delta = sum(
                            abs(lm[j].x - prev_lm[j].x) + abs(lm[j].y - prev_lm[j].y)
                            for j in KEY_JOINTS
                        )
                        movement_sum += delta
                    if results.pose_landmarks:
                        prev_data = results.pose_landmarks.landmark

                if frame_count % 10 == 0:
                    score = min(100, int(movement_sum * (5 if use_framediff else 800)))
                    self._movement_score = score
                    movement_sum = 0.0
                    self._update_movement_bar(score)

                time.sleep(0.05)

        except Exception as e:
            self._update_cam_status(f"📷  Errore: {e}", COLORS["danger"])
        finally:
            cap.release()
            if pose_ctx:
                try:
                    pose_ctx.close()
                except Exception:
                    pass

    def _update_cam_status(self, text, color):
        if self.window and self.window.winfo_exists():
            self.window.after(0, lambda: self.cam_label.configure(text=text, fg=color))

    def _update_movement_bar(self, score: int):
        if not self.window or not self.window.winfo_exists():
            return
        def _draw():
            ex = EXERCISES[self._current_exercise]
            if ex.get("static"):
                return
            c = self.movement_bar
            c.delete("all")
            c.create_rectangle(0, 0, 260, 8, fill=COLORS["border"], outline="")
            color = COLORS["success"] if score > 30 else COLORS["accent2"] if score > 10 else COLORS["danger"]
            c.create_rectangle(0, 0, int(2.6 * score), 8, fill=color, outline="")
            label = "✅ Ottimo movimento!" if score > 30 else "⚠️ Muoviti di più!"
            lc = COLORS["success"] if score > 30 else COLORS["accent2"]
            self.cam_label.configure(text=f"📷  {label}", fg=lc)
        self.window.after(0, _draw)

    # ── ACTIONS ────────────────────────────────────────────────────────────────
    def _use_jolly(self):
        if self.state.use_jolly():
            self.notifier.jolly_used(self.state.jolly_remaining)
            self.state.log_break_skipped()
            self._close()
        else:
            self.notifier.jolly_empty()

    def _toggle_meeting(self):
        self.state.is_meeting = True
        self._close()

    def _finish_break(self):
        if self.state.settings.webcam_enabled:
            if self._movement_score > 20:
                self.state.log_movement(detected=True)
                self.notifier.movement_good()
            else:
                self.state.log_movement(detected=False)
                self.notifier.movement_missing()
        self.state.log_break_completed()
        self.notifier.break_ended()
        self._close()

    def _close(self):
        self._running = False
        self.state.is_on_break = False
        if self._audio:
            self._audio.stop()
            self._audio = None
        # Destroy every monitor window
        for (win, *_rest) in self._all_monitor_wins:
            try:
                if win.winfo_exists():
                    win.destroy()
            except Exception:
                pass
        self._all_monitor_wins = []
        if self.window and self.window.winfo_exists():
            try:
                self.window.destroy()
            except Exception:
                pass
        self.window = None
