"""
TimerEngine - 55/5 cycle, water/snack reminders, Teams detection
"""

import time
import subprocess
import threading
import shutil
import struct
import math
import wave
import tempfile
import os
from datetime import datetime, timedelta
from modules.state import AppState
from modules.notification import NotificationManager


def _is_meeting_running() -> bool:
    """Detect active calls: checks webcam/mic device usage."""
    try:
        import glob
        devices = glob.glob("/dev/video*") + glob.glob("/dev/snd/pcm*C*")
        if devices:
            result = subprocess.run(["fuser"] + devices,
                                    capture_output=True, text=True, timeout=3)
            pids = (result.stdout + result.stderr).strip()
            if any(c.isdigit() for c in pids):
                return True
    except Exception:
        pass
    try:
        import glob
        for dev in glob.glob("/dev/video*"):
            result = subprocess.run(["lsof", dev],
                                    capture_output=True, text=True, timeout=3)
            if len(result.stdout.strip().splitlines()) > 1:
                return True
    except Exception:
        pass
    try:
        result = subprocess.run(["pactl", "list", "short", "source-outputs"],
                                capture_output=True, text=True, timeout=3)
        if result.stdout.strip():
            return True
    except Exception:
        pass
    return False


def _play_notification_sound():
    """Play a short chime for desktop notifications using system audio."""
    try:
        # Try pygame first (may already be loaded)
        import pygame
        import numpy as np
        if pygame.mixer.get_init():
            sr, dur = 44100, 0.5
            t = np.linspace(0, dur, int(sr * dur), endpoint=False)
            wave_data = (
                0.3 * np.sin(2 * np.pi * 880 * t) +
                0.2 * np.sin(2 * np.pi * 1100 * t)
            ) * np.exp(-6 * t / dur)
            stereo = np.column_stack([wave_data, wave_data])
            stereo = np.clip(stereo * 32767, -32768, 32767).astype(np.int16)
            snd = pygame.sndarray.make_sound(stereo)
            snd.set_volume(0.7)
            snd.play()
            return
    except Exception:
        pass

    # Fallback: generate WAV and play with paplay/aplay
    try:
        sr, freq, dur, vol = 44100, 880, 0.5, 0.3
        n = int(sr * dur)
        fade = int(sr * 0.1)
        samples = []
        for i in range(n):
            v = math.sin(2 * math.pi * freq * i / sr)
            env = 1.0
            if i < fade:
                env = i / fade
            elif i > n - fade:
                env = (n - i) / fade
            samples.append(int(v * env * vol * 32767))
        data = struct.pack(f"<{n}h", *samples)
        tmp = tempfile.NamedTemporaryFile(suffix=".wav", delete=False)
        with wave.open(tmp.name, 'w') as wf:
            wf.setnchannels(1)
            wf.setsampwidth(2)
            wf.setframerate(sr)
            wf.writeframes(data)
        for player in ["paplay", "aplay", "ffplay"]:
            if shutil.which(player):
                args = [player, tmp.name]
                if player == "ffplay":
                    args = ["ffplay", "-nodisp", "-autoexit",
                            "-loglevel", "quiet", tmp.name]
                subprocess.Popen(args)
                break
        # Clean up after a delay
        def cleanup():
            time.sleep(2)
            try:
                os.unlink(tmp.name)
            except Exception:
                pass
        threading.Thread(target=cleanup, daemon=True).start()
    except Exception as e:
        print(f"[Sound] {e}")


class TimerEngine:
    def __init__(self, state: AppState, notifier: NotificationManager, lock_screen):
        self.state = state
        self.notifier = notifier
        self.lock_screen = lock_screen
        self._running = False
        self._reschedule_event = threading.Event()
        self._snack_notified: set = set()
        self._warning_sent = False   # 1-min warning flag

    def run(self):
        self._running = True
        self._schedule_next_break()
        self._schedule_next_water()

        while self._running:
            if not self.state.is_work_hours():
                time.sleep(30)
                continue

            now = datetime.now()

            # 1-minute warning before break
            if self.state.next_break_time:
                secs_left = (self.state.next_break_time - now).total_seconds()
                if 50 <= secs_left <= 70 and not self._warning_sent:
                    self._warning_sent = True
                    self._trigger_warning()
                elif secs_left > 70:
                    self._warning_sent = False

            # Break time
            if self.state.next_break_time and now >= self.state.next_break_time:
                self._warning_sent = False
                self._trigger_break()

            # Water reminder
            if self.state.next_water_time and now >= self.state.next_water_time:
                self._trigger_water()

            # Snack reminders
            self._check_snack()

            self._reschedule_event.wait(timeout=10)
            self._reschedule_event.clear()

    def stop(self):
        self._running = False
        self._reschedule_event.set()

    def reschedule(self):
        self._warning_sent = False
        self._schedule_next_break()
        self._reschedule_event.set()

    def _schedule_next_break(self):
        interval = self.state.settings.work_interval_min
        self.state.next_break_time = datetime.now() + timedelta(minutes=interval)
        print(f"[Timer] Prossima pausa: {self.state.next_break_time.strftime('%H:%M:%S')}")

    def _schedule_next_water(self):
        interval = self.state.settings.water_interval_min
        self.state.next_water_time = datetime.now() + timedelta(minutes=interval)

    def _trigger_warning(self):
        """1-minute warning before break."""
        self.notifier._send(
            "⏰  Pausa tra 1 minuto",
            "Finisci quello che stai facendo — il blocco arriva tra poco.",
            urgency="normal",
            icon="appointment-soon"
        )
        threading.Thread(target=_play_notification_sound, daemon=True).start()
        print("[Timer] Avviso 1 minuto prima della pausa")

    def _trigger_break(self):
        if self.state.is_meeting:
            self.notifier._send("📅 Pausa posticipata",
                                "Sei in riunione. Riprogrammata.", urgency="low")
            self._schedule_next_break()
            return
        if _is_meeting_running():
            self.notifier._send(
                "📅 Pausa posticipata",
                "Riunione rilevata. Riprogrammata tra 10 minuti.", urgency="low")
            self.state.next_break_time = datetime.now() + timedelta(minutes=10)
            return
        print("[Timer] Break time!")
        threading.Thread(target=_play_notification_sound, daemon=True).start()
        self.lock_screen.show()
        self._schedule_next_break()

    def _trigger_water(self):
        if self.state.settings.water_enabled:
            self.notifier.water_reminder()
            threading.Thread(target=_play_notification_sound, daemon=True).start()
        self._schedule_next_water()

    def _check_snack(self):
        if not self.state.settings.snack_enabled:
            return
        now = datetime.now()
        current_hhmm = now.strftime("%H:%M")
        for snack_time in self.state.settings.snack_times:
            if current_hhmm == snack_time and snack_time not in self._snack_notified:
                self._snack_notified.add(snack_time)
                self.notifier.snack_reminder()
                threading.Thread(target=_play_notification_sound, daemon=True).start()
        if now.hour == 0 and now.minute == 0:
            self._snack_notified.clear()

    def minutes_until_break(self) -> int:
        if not self.state.next_break_time:
            return 0
        delta = self.state.next_break_time - datetime.now()
        return max(0, int(delta.total_seconds() / 60))

    def seconds_until_break(self) -> int:
        if not self.state.next_break_time:
            return 0
        delta = self.state.next_break_time - datetime.now()
        return max(0, int(delta.total_seconds()))
