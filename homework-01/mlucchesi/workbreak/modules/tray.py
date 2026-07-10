"""
SystemTrayApp - System tray icon and menu via pystray

pystray callbacks run in a foreign thread — tkinter is NOT thread-safe.
All UI actions must be dispatched to the tkinter main loop via root.after().
"""

from modules.state import AppState
from modules.timer_engine import TimerEngine
from modules.dashboard import Dashboard
from modules.lock_screen import LockScreen


class SystemTrayApp:
    def __init__(self, root, state: AppState, timer: TimerEngine,
                 dashboard: Dashboard, lock_screen: LockScreen):
        self.root = root          # tkinter root — needed for .after()
        self.state = state
        self.timer = timer
        self.dashboard = dashboard
        self.lock_screen = lock_screen
        self._icon = None

    # ── helpers: always dispatch to main thread ────────────────
    def _ui(self, fn):
        """Schedule fn() on the tkinter main thread."""
        self.root.after(0, fn)

    def run(self):
        try:
            import pystray
            from PIL import Image, ImageDraw
        except ImportError:
            print("[Tray] pystray/Pillow non disponibili.")
            return

        def make_icon(color="#4ECDC4"):
            img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
            draw = ImageDraw.Draw(img)
            draw.ellipse([4, 4, 60, 60], fill="#163535", outline=color, width=3)
            draw.ellipse([20, 18, 44, 46], fill=color)
            draw.line([32, 46, 32, 54], fill=color, width=3)
            return img

        # ── menu callbacks (foreign thread → dispatch to tkinter) ──
        def on_dashboard(icon, item):
            self._ui(self.dashboard.show)

        def on_settings(icon, item):
            self._ui(self.dashboard.show_settings)

        def on_test_break(icon, item):
            self._ui(self.lock_screen._build_window)

        def on_meeting(icon, item):
            self.state.is_meeting = not self.state.is_meeting
            icon.icon = make_icon("#FFD166" if self.state.is_meeting else "#4ECDC4")
            print(f"[Tray] Riunione: {'attiva' if self.state.is_meeting else 'disattivata'}")

        def on_quit(icon, item):
            self._ui(self.root.quit)
            icon.stop()

        def next_break_label(item):
            return f"Prossima pausa: {self.timer.minutes_until_break()} min"

        def jolly_label(item):
            return f"Jolly rimasti: {self.state.jolly_remaining}"

        def meeting_label(item):
            return "Riunione attiva ✓" if self.state.is_meeting else "Sono in riunione"

        menu = pystray.Menu(
            pystray.MenuItem(next_break_label, None, enabled=False),
            pystray.MenuItem(jolly_label,      None, enabled=False),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Dashboard",          on_dashboard),
            pystray.MenuItem("Impostazioni",       on_settings),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Testa blocco adesso", on_test_break),
            pystray.MenuItem(meeting_label,         on_meeting),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem("Esci",               on_quit),
        )

        self._icon = pystray.Icon("workbreak", make_icon(), "WorkBreak", menu=menu)
        self._icon.run()

    def stop(self):
        if self._icon:
            try:
                self._icon.stop()
            except Exception:
                pass
