#!/usr/bin/env python3
"""
WorkBreak - Linux health companion for desk workers
"""

import sys
import os
import signal
import threading

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from modules.state import AppState
from modules.timer_engine import TimerEngine
from modules.notification import NotificationManager
from modules.tray import SystemTrayApp
from modules.lock_screen import LockScreen
from modules.dashboard import Dashboard

import tkinter as tk


def main():
    root = tk.Tk()
    root.withdraw()

    state    = AppState()
    notifier = NotificationManager(state)
    lock_screen = LockScreen(root, state, notifier)
    dashboard   = Dashboard(root, state)
    timer       = TimerEngine(state, notifier, lock_screen)

    # Wire references so Dashboard Test tab and Timer can reach everything
    dashboard.set_timer(timer)
    timer.notifier    = notifier
    timer.lock_screen = lock_screen

    # Pass root to tray so it can dispatch to the tkinter main thread
    tray = SystemTrayApp(root, state, timer, dashboard, lock_screen)

    def on_close(sig=None, frame=None):
        timer.stop()
        tray.stop()
        root.quit()

    signal.signal(signal.SIGINT,  on_close)
    signal.signal(signal.SIGTERM, on_close)

    threading.Thread(target=timer.run, daemon=True).start()
    threading.Thread(target=tray.run,  daemon=True).start()

    print("WorkBreak avviato. Cerca l'icona nel system tray.")
    print("Tasto destro → Impostazioni / Testa blocco adesso")
    root.mainloop()


if __name__ == "__main__":
    main()
