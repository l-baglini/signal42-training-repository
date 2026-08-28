"""Playing a song: a clock over a score, and what is under the fingers now.

This is the piece that makes a song behave like everything else the app draws.
A chord is a set of positions; a song at a given moment is *also* a set of
positions, so :meth:`Transport.resolved` hands back the same
:class:`~fretguide.types.ResolvedSelection` the chord and scale paths produce
and the renderer needs to learn nothing about songs. That is deliberate: the
overlay is about to be ported to QPainter, and a song-shaped special case in
``render.py`` would have to be ported twice.

**No wall clock in here.** :meth:`Transport.tick` is handed the elapsed seconds
by whoever is driving it, which keeps the whole thing pure and testable, and
means the same object works against a video frame's timestamp, a test's
made-up delta, and eventually a Qt timer.
"""

from __future__ import annotations

from dataclasses import dataclass, field

from .score import Song, SongTrack
from .types import FretPosition, ResolvedSelection, StringNumber

#: Slowest and fastest practice speeds. Below a quarter speed the gaps between
#: notes stop reading as music at all; above double, slowing down was not the
#: point.
MIN_RATE = 0.25
MAX_RATE = 2.0

#: How long a note stays lit, at minimum, in beats. A sixteenth at 120 bpm lasts
#: 125 ms — four frames at 30 fps — which registers as a flicker rather than as
#: an instruction. Holding the dot slightly longer than the note is the whole
#: reason this constant exists; it is a *display* floor and never changes the
#: score.
MIN_VISIBLE = 0.3


@dataclass
class Transport:
    """A play head over one track of one song."""

    song: Song
    track: SongTrack
    beat: float = 0.0
    playing: bool = False
    rate: float = 1.0  # 0.5 = half speed
    loop: bool = True
    min_visible: float = MIN_VISIBLE
    #: Set when the play head passes the end and `loop` is off.
    finished: bool = field(default=False, init=False)

    # ----------------------------------------------------------------- clock

    def tick(self, dt: float) -> None:
        """Advance by ``dt`` wall-clock seconds, if playing."""
        if not self.playing or dt <= 0:
            return
        # Beats per second comes from the tempo *at the play head*, so a song
        # that changes speed halfway does so during playback too rather than
        # only in the seconds-to-beats conversion.
        self.beat += dt * self.song.bpm_at(self.beat) / 60.0 * self.rate
        end = self.song.length
        if end > 0 and self.beat >= end:
            if self.loop:
                self.beat %= end
            else:
                self.beat, self.playing, self.finished = end, False, True

    def follow(self, seconds: float) -> None:
        """Put the play head where an external clock says it is.

        Used when audio is playing: the sound card's position, not the video
        frame's timestamp, decides where in the song we are. ``seconds`` is
        measured in the *buffer*, which was rendered at ``rate``, so a song
        second is ``rate`` buffer seconds — at half speed the buffer is twice
        as long and the play head must not advance twice as fast with it.
        """
        self.beat = self.song.beat_at(seconds * self.rate)
        self.finished = False

    def toggle(self) -> None:
        if self.finished:
            self.beat, self.finished = 0.0, False
        self.playing = not self.playing

    # ------------------------------------------------------------------ seek

    def seek(self, beat: float) -> None:
        self.beat = max(0.0, min(beat, self.song.length))
        self.finished = False

    def seek_bar(self, number: int) -> None:
        """Jump to the start of a bar, counting from 1."""
        bars = self.song.bars
        if not bars:
            return
        self.seek(bars[max(0, min(number, len(bars)) - 1)].start)

    def nudge_bars(self, delta: int) -> None:
        """Step whole bars. Stepping back from mid-bar returns to its start
        first, which is what a player expects from a rewind key."""
        bar = self.song.bar_at(self.beat)
        if bar is None:
            return
        if delta < 0 and self.beat > bar.start + 1e-6:
            delta += 1
        self.seek_bar(bar.number + delta)

    def scale_rate(self, factor: float) -> None:
        self.rate = max(MIN_RATE, min(MAX_RATE, self.rate * factor))

    # ------------------------------------------------------------- rendering

    def sounding(self) -> tuple:
        """Notes under the fingers right now, held notes included."""
        lo = self.beat
        return tuple(
            n
            for n in self.track.notes
            if n.start <= lo < max(n.end, n.start + self.min_visible)
        )

    def resolved(self) -> ResolvedSelection:
        """This instant, in the terms the renderer already speaks."""
        notes = self.sounding()
        positions: list[FretPosition] = []
        open_strings: list[StringNumber] = []
        seen: set[StringNumber] = set()
        for n in notes:
            # A held note and a freshly struck one can collide on a string when
            # the display floor stretches the first past the second. The newer
            # note wins: notes are in time order, so the later one overwrites.
            if n.string in seen:
                positions = [p for p in positions if p.string != n.string]
                open_strings = [s for s in open_strings if s != n.string]
            seen.add(n.string)
            if n.fret == 0:
                open_strings.append(n.string)
            else:
                positions.append(FretPosition(string=n.string, fret=n.fret))
        return ResolvedSelection(
            name=self.label,
            positions=tuple(positions),
            open=tuple(open_strings),
        )

    @property
    def label(self) -> str:
        bar = self.song.bar_at(self.beat)
        where = f"bar {bar.number}/{len(self.song.bars)}" if bar else "—"
        speed = "" if abs(self.rate - 1.0) < 1e-6 else f" · {self.rate:g}x"
        state = "" if self.playing else " · PAUSED"
        bpm = self.song.bpm_at(self.beat) * self.rate
        return f"{self.song.title} · {self.track.name} · {where} · {bpm:.0f} bpm{speed}{state}"

    @property
    def elapsed(self) -> float:
        """Seconds into the song, at the written tempo."""
        return self.song.seconds_at(self.beat)
