"""
AppState - Central state for WorkBreak
"""

import json
import os
from datetime import datetime, date
from dataclasses import dataclass, field, asdict
from typing import List, Optional


STATE_FILE = os.path.expanduser("~/.config/workbreak/state.json")


@dataclass
class DayStats:
    date: str = ""
    breaks_completed: int = 0
    breaks_skipped: int = 0
    jolly_used: int = 0
    water_reminders: int = 0
    water_confirmed: int = 0
    snack_reminders: int = 0
    movement_detected: int = 0
    movement_missed: int = 0
    work_start: Optional[str] = None
    work_end: Optional[str] = None


@dataclass
class AppSettings:
    work_start_hour: int = 8
    work_start_min: int = 30
    work_end_hour: int = 18
    work_end_min: int = 30
    lunch_start_hour: int = 12
    lunch_start_min: int = 30
    lunch_end_hour: int = 13
    lunch_end_min: int = 30
    work_interval_min: int = 55
    break_duration_min: int = 5
    jolly_per_day: int = 2
    water_interval_min: int = 45
    snack_times: List[str] = field(default_factory=lambda: ["10:30", "16:00"])
    webcam_enabled: bool = True
    snack_enabled: bool = True
    water_enabled: bool = True
    ambient_music: str = "am_chord"   # am_chord | forest | rain | none
    ambient_volume: float = 0.45      # 0.0 – 1.0
    chime_enabled: bool = True
    ui_monitor: str = "primary"   # primary | left | right | center | <monitor-name>
    theme: str = "teal"
    lock_all_monitors: bool = True


class AppState:
    def __init__(self):
        self.settings = AppSettings()
        self.today_stats = DayStats(date=str(date.today()))
        self.jolly_remaining = self.settings.jolly_per_day
        self.is_working = False
        self.is_on_break = False
        self.is_meeting = False
        self.next_break_time: Optional[datetime] = None
        self.next_water_time: Optional[datetime] = None
        self._load()

    def _config_dir(self):
        d = os.path.expanduser("~/.config/workbreak")
        os.makedirs(d, exist_ok=True)
        return d

    def _load(self):
        path = os.path.join(self._config_dir(), "state.json")
        if not os.path.exists(path):
            return
        try:
            with open(path) as f:
                data = json.load(f)
            # Reset stats if new day
            if data.get("today_stats", {}).get("date") != str(date.today()):
                self.today_stats = DayStats(date=str(date.today()))
                self.jolly_remaining = self.settings.jolly_per_day
            else:
                s = data.get("today_stats", {})
                self.today_stats = DayStats(**s)
                self.jolly_remaining = self.settings.jolly_per_day - self.today_stats.jolly_used
            # Load settings
            cfg = data.get("settings", {})
            for k, v in cfg.items():
                if hasattr(self.settings, k):
                    setattr(self.settings, k, v)
            # Restore next_break_time so the timer survives restarts
            nbt = data.get("next_break_time")
            if nbt:
                try:
                    self.next_break_time = datetime.fromisoformat(nbt)
                    print(f"[State] Prossima pausa ripristinata: {self.next_break_time.strftime('%H:%M:%S')}")
                except Exception:
                    pass
        except Exception as e:
            print(f"State load error: {e}")

    def save(self):
        path = os.path.join(self._config_dir(), "state.json")
        try:
            data = {
                "today_stats": asdict(self.today_stats),
                "settings": asdict(self.settings),
                "next_break_time": self.next_break_time.isoformat() if self.next_break_time else None,
            }
            with open(path, "w") as f:
                json.dump(data, f, indent=2)
        except Exception as e:
            print(f"State save error: {e}")

    def use_jolly(self) -> bool:
        if self.jolly_remaining > 0:
            self.jolly_remaining -= 1
            self.today_stats.jolly_used += 1
            self.save()
            return True
        return False

    def log_break_completed(self):
        self.today_stats.breaks_completed += 1
        self.save()

    def log_break_skipped(self):
        self.today_stats.breaks_skipped += 1
        self.save()

    def log_water(self, confirmed: bool):
        self.today_stats.water_reminders += 1
        if confirmed:
            self.today_stats.water_confirmed += 1
        self.save()

    def log_movement(self, detected: bool):
        if detected:
            self.today_stats.movement_detected += 1
        else:
            self.today_stats.movement_missed += 1
        self.save()

    def is_work_hours(self) -> bool:
        now = datetime.now()
        s = self.settings
        start = now.replace(hour=s.work_start_hour, minute=s.work_start_min, second=0, microsecond=0)
        end   = now.replace(hour=s.work_end_hour,   minute=s.work_end_min,   second=0, microsecond=0)
        lunch_s = now.replace(hour=s.lunch_start_hour, minute=s.lunch_start_min, second=0, microsecond=0)
        lunch_e = now.replace(hour=s.lunch_end_hour,   minute=s.lunch_end_min,   second=0, microsecond=0)
        in_work = start <= now <= end
        in_lunch = lunch_s <= now <= lunch_e
        return in_work and not in_lunch and not self.is_meeting
