"""
NotificationManager - Desktop notifications via notify-send / plyer
"""

import subprocess
import shutil
from modules.state import AppState


class NotificationManager:
    def __init__(self, state: AppState):
        self.state = state
        self._has_notify = shutil.which("notify-send") is not None

    def _send(self, title: str, body: str, urgency: str = "normal", icon: str = "dialog-information"):
        if self._has_notify:
            try:
                subprocess.Popen([
                    "notify-send",
                    "-u", urgency,
                    "-i", icon,
                    "-a", "WorkBreak",
                    title, body
                ])
            except Exception as e:
                print(f"[Notify] {title}: {body} (notify-send failed: {e})")
        else:
            print(f"[Notify] {title}: {body}")

    def break_incoming(self, minutes: int):
        self._send(
            "☕ Pausa tra poco",
            f"La tua pausa inizia tra {minutes} minuti. Finisci quello che stai facendo.",
            urgency="low",
            icon="appointment-soon"
        )

    def break_starting(self):
        self._send(
            "🧘 È ora di fare pausa!",
            "5 minuti per te. Alzati, stirati, respira.",
            urgency="critical",
            icon="appointment-soon"
        )

    def break_ended(self):
        self._send(
            "💪 Pausa completata!",
            "Ben fatto! Torna al lavoro riposato.",
            urgency="low",
            icon="emblem-default"
        )

    def jolly_used(self, remaining: int):
        self._send(
            f"🃏 Jolly usato ({remaining} rimanenti oggi)",
            "La pausa è stata saltata. Usalo con saggezza!",
            urgency="normal",
            icon="dialog-warning"
        )

    def jolly_empty(self):
        self._send(
            "🚫 Nessun jolly rimasto",
            "Hai esaurito i jolly per oggi. La pausa è obbligatoria!",
            urgency="critical",
            icon="dialog-error"
        )

    def water_reminder(self):
        self.state.log_water(confirmed=False)
        self._send(
            "💧 Bevi acqua!",
            "Sono passati 45 minuti. Hai bevuto abbastanza?",
            urgency="low",
            icon="dialog-information"
        )

    def snack_reminder(self):
        self._send(
            "🍎 Ora della merenda",
            "Un piccolo spuntino sano ti aiuterà a mantenere l'energia.",
            urgency="low",
            icon="dialog-information"
        )

    def movement_good(self):
        self._send(
            "✅ Ottimo movimento!",
            "Hai fatto stretching. Il tuo corpo ti ringrazia.",
            urgency="low",
            icon="emblem-default"
        )

    def movement_missing(self):
        self._send(
            "⚠️ Muoviti di più!",
            "Non ho rilevato movimento sufficiente. Alzati e stirati!",
            urgency="normal",
            icon="dialog-warning"
        )
