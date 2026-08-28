"""A song as a timed sequence of fretboard positions.

This is the layer between a score file and the overlay. It answers one question:
*at this moment in the song, where do the fingers go?* -- and it answers it in
exactly the terms the renderer already speaks, ``(string, fret)``, so nothing in
``render.py`` has to learn what a song is.

**Time is carried in beats, not seconds.** A beat here is a quarter note. Two
things follow, and both are the reason for the choice:

- "Play it at half speed" becomes one multiplier at the transport rather than a
  rewrite of every onset. Seconds would bake the tempo into the score.
- A mid-song tempo change becomes a *map* from beats to seconds
  (:meth:`Song.seconds_at`) instead of a re-derivation of everything after it.

**Guitar Pro numbers strings the way this project does** -- 1 = high E, 6 = low
E -- which is checked per track rather than assumed, because a drop-D or
seven-string file would otherwise land every note on the wrong string silently.
See :attr:`SongTrack.standard_tuning`.

Reading a Guitar Pro file needs the ``[score]`` extra; the model itself has no
dependencies, so the transport and the tests can use it without one.
"""

from __future__ import annotations

from bisect import bisect_right
from dataclasses import dataclass
from pathlib import Path

from .theory import OPEN_NOTES, midi_to_name, pitch_to_midi
from .types import StringNumber

#: Guitar Pro's tick resolution: ticks per quarter note. Its ``Beat.start`` is
#: absolute and one-based, i.e. the first beat of the song starts at 960, not 0.
_QUARTER_TICKS = 960

#: Frets the model can pose to on live video -- the neck ends, for camera
#: purposes, at the twelfth fret because that is the last one FretNet predicts
#: keypoints for. Tracks reaching past it are playable only on the synthetic
#: neck, and :attr:`SongTrack.fits_camera` says so rather than letting the
#: overlay quietly draw nothing.
CAMERA_MAX_FRET = 12


@dataclass(frozen=True)
class SongNote:
    """One note: where the finger goes, when, and for how long."""

    string: StringNumber  # 1 = high E ... 6 = low E
    fret: int  # 0 = open
    start: float  # beats from the start of the song
    duration: float  # beats
    dead: bool = False  # a muted "x" -- the hand is there, the note is not

    @property
    def end(self) -> float:
        return self.start + self.duration


@dataclass(frozen=True)
class Bar:
    """A measure, for a transport that rewinds and loops in musical units."""

    number: int  # 1-based, as printed on the score
    start: float  # beats
    length: float  # beats

    @property
    def end(self) -> float:
        return self.start + self.length


@dataclass(frozen=True)
class TempoChange:
    start: float  # beats
    bpm: float


@dataclass(frozen=True)
class SongTrack:
    """One instrument's part."""

    name: str
    notes: tuple[SongNote, ...]
    string_count: int
    percussion: bool = False
    #: False when the track's open strings are not standard tuning. The finger
    #: positions stay correct -- a fret is a fret whatever the string is tuned
    #: to -- but the *pitches* do not, so anything naming notes must not trust
    #: this track.
    standard_tuning: bool = True
    tuning: tuple[str, ...] = ()  # open notes, string 1 first

    @property
    def max_fret(self) -> int:
        return max((n.fret for n in self.notes), default=0)

    @property
    def playable(self) -> bool:
        """Can this go on a six-string neck at all? Bass and drums cannot."""
        return not self.percussion and self.string_count == 6

    @property
    def fits_camera(self) -> bool:
        """True when every note is inside the twelve frets the model can pose."""
        return self.max_fret <= CAMERA_MAX_FRET

    @property
    def frets_above_camera(self) -> float:
        """Fraction of notes the camera path cannot place. 0.0 when it all fits."""
        if not self.notes:
            return 0.0
        return sum(n.fret > CAMERA_MAX_FRET for n in self.notes) / len(self.notes)


@dataclass(frozen=True)
class Song:
    """A score file, read."""

    title: str
    artist: str
    tracks: tuple[SongTrack, ...]
    bars: tuple[Bar, ...]
    tempos: tuple[TempoChange, ...]  # always non-empty; first starts at beat 0

    @property
    def length(self) -> float:
        """Total length in beats."""
        return self.bars[-1].end if self.bars else 0.0

    def seconds_at(self, beat: float) -> float:
        """Wall-clock seconds from the start of the song to ``beat``.

        Walks the tempo map rather than dividing by a single tempo, so a song
        that changes speed halfway still lines up with the recording.
        """
        seconds = 0.0
        for i, t in enumerate(self.tempos):
            if t.start >= beat:
                break
            nxt = self.tempos[i + 1].start if i + 1 < len(self.tempos) else beat
            seconds += (min(nxt, beat) - t.start) * 60.0 / t.bpm
        return seconds

    def beat_at(self, seconds: float) -> float:
        """The inverse of :meth:`seconds_at` — where a wall clock has got to.

        Needed when something other than this object owns the clock. Audio is
        the case that matters: a sound card's playback position is in seconds
        and is far steadier than a video frame's timestamp, so when audio plays
        it drives the play head rather than the other way round.
        """
        if seconds <= 0.0:
            return 0.0
        elapsed = 0.0
        for i, t in enumerate(self.tempos):
            end = self.tempos[i + 1].start if i + 1 < len(self.tempos) else None
            span = ((end - t.start) * 60.0 / t.bpm) if end is not None else float("inf")
            if elapsed + span >= seconds:
                return t.start + (seconds - elapsed) * t.bpm / 60.0
            elapsed += span
        return self.length

    def bpm_at(self, beat: float) -> float:
        """The tempo in force at ``beat`` — what a playing clock advances by."""
        current = self.tempos[0].bpm
        for t in self.tempos:
            if t.start > beat:
                break
            current = t.bpm
        return current

    def bar_at(self, beat: float) -> Bar | None:
        """The bar containing ``beat``, for a transport that seeks musically."""
        if not self.bars:
            return None
        i = bisect_right([b.start for b in self.bars], beat) - 1
        return self.bars[i] if i >= 0 else None

    def notes_between(self, track: SongTrack, lo: float, hi: float) -> tuple[SongNote, ...]:
        """Notes *sounding* at any point in ``[lo, hi)`` -- held notes included.

        Held notes are the point: a note struck two bars ago and still ringing is
        still a finger on the fretboard, and the overlay has to keep drawing it.
        """
        return tuple(n for n in track.notes if n.start < hi and n.end > lo)


# --------------------------------------------------------------------------- #
# Guitar Pro
# --------------------------------------------------------------------------- #


def read_guitarpro(path: str | Path) -> Song:
    """Read a ``.gp3`` / ``.gp4`` / ``.gp5`` file into a :class:`Song`.

    Needs the ``[score]`` extra. Repeats are unrolled, so the returned timeline
    is playback order rather than page order.
    """
    try:
        import guitarpro
    except ImportError as exc:  # pragma: no cover - exercised by the message alone
        raise ImportError(
            "reading Guitar Pro files needs the [score] extra: pip install -e '.[score]'"
        ) from exc

    song = guitarpro.parse(str(Path(path)))
    order = _playback_order(song)
    bars, spans = _bars(song, order)
    return Song(
        title=song.title.strip(),
        # Tabs fill these in inconsistently: plenty leave `artist` blank and put
        # the name in the words/music credit instead.
        artist=(song.artist or song.words or song.music or song.album or "").strip(),
        tracks=tuple(_track(t, order, spans) for t in song.tracks),
        bars=bars,
        tempos=_tempo_map(song, order, spans),
    )


def _playback_order(song) -> tuple[int, ...]:
    """Measure indices in the order they are *played*, with repeats unrolled.

    Page order is not playback order, and a transport that ignores the
    difference drifts out of sync with the recording the moment a section
    repeats. Alternate endings are honoured by their pass number: Guitar Pro
    stores ``repeatAlternative`` as a bitmask, bit *n* meaning "play this on
    pass n+1".
    """
    headers = song.tracks[0].measures if song.tracks else []
    order: list[int] = []
    # `start` defaults to 0 because a repeat close with no matching open repeats
    # from the top of the song, which is how most tabs write a single loop.
    i, start, pass_no = 0, 0, 1
    guard = 0
    while i < len(headers):
        guard += 1
        if guard > 10_000:  # a malformed repeat structure must not hang the app
            break
        h = headers[i].header
        # Only on *entering* a new repeat group. Resetting whenever the bar is
        # merely marked repeat-open would re-zero the pass counter on every jump
        # back to it, and the loop would never terminate.
        if h.isRepeatOpen and i != start:
            start, pass_no = i, 1

        alt = getattr(h, "repeatAlternative", 0) or 0
        if alt and not alt & (1 << (pass_no - 1)):
            i += 1  # an ending for a different pass -- skip it
            continue

        order.append(i)

        close = getattr(h, "repeatClose", 0) or 0
        if close > 0 and pass_no < close:
            pass_no += 1
            i = start
            continue
        i += 1
    return tuple(order)


def _bars(song, order: tuple[int, ...]) -> tuple[tuple[Bar, ...], dict[int, list[float]]]:
    """Build the played bar list, and where each source measure lands in time.

    ``spans`` maps a source measure index to every beat-offset it is played at,
    which is what lets an unrolled repeat place the same written notes twice.
    """
    headers = song.tracks[0].measures if song.tracks else []
    bars: list[Bar] = []
    spans: dict[int, list[float]] = {}
    at = 0.0
    for n, idx in enumerate(order, start=1):
        sig = headers[idx].timeSignature
        length = sig.numerator * 4.0 / sig.denominator.value
        bars.append(Bar(number=n, start=at, length=length))
        spans.setdefault(idx, []).append(at)
        at += length
    return tuple(bars), spans


def _tempo_map(song, order: tuple[int, ...], spans: dict[int, list[float]]) -> tuple[TempoChange, ...]:
    changes = [TempoChange(start=0.0, bpm=float(song.tempo))]
    if not song.tracks:
        return tuple(changes)
    for idx, measure in enumerate(song.tracks[0].measures):
        if idx not in spans:
            continue
        for voice in measure.voices:
            for beat in voice.beats:
                mix = beat.effect.mixTableChange
                if mix is None or mix.tempo is None:
                    continue
                offset = (beat.start - measure.start) / _QUARTER_TICKS
                for base in spans[idx]:
                    changes.append(TempoChange(base + offset, float(mix.tempo.value)))
    changes.sort(key=lambda c: c.start)
    return tuple(changes)


def _track(track, order: tuple[int, ...], spans: dict[int, list[float]]) -> SongTrack:
    tuning = {s.number: s.value for s in track.strings}
    standard = all(
        n in OPEN_NOTES and pitch_to_midi(OPEN_NOTES[n]) == v for n, v in tuning.items()
    )
    notes: list[SongNote] = []
    for idx, measure in enumerate(track.measures):
        if idx not in spans:
            continue  # a written measure that is never played (an unused ending)
        for base in spans[idx]:
            _read_measure(measure, base, notes)
    notes.sort(key=lambda n: (n.start, -n.string))
    return SongTrack(
        name=track.name.strip(),
        notes=tuple(notes),
        string_count=len(track.strings),
        percussion=bool(track.isPercussionTrack),
        standard_tuning=standard,
        tuning=tuple(midi_to_name(tuning[k]) for k in sorted(tuning)),
    )


def _read_measure(measure, base: float, out: list[SongNote]) -> None:
    """Append one measure's notes, resolving ties into the note they extend.

    A tied note is not a new note -- the finger never left the string. Emitting
    it as its own event would make the overlay re-draw a placement the player is
    already holding, which reads as a repeated instruction to do nothing.
    """
    for voice in measure.voices:
        for beat in voice.beats:
            start = base + (beat.start - measure.start) / _QUARTER_TICKS
            length = beat.duration.time / _QUARTER_TICKS
            for note in beat.notes:
                kind = note.type.name
                if kind == "tie":
                    _extend(out, note.string, start + length)
                    continue
                out.append(
                    SongNote(
                        string=note.string,
                        fret=note.value,
                        start=start,
                        duration=length,
                        dead=(kind == "dead"),
                    )
                )


def _extend(out: list[SongNote], string: int, end: float) -> None:
    """Stretch the most recent note on ``string`` out to ``end``."""
    for i in range(len(out) - 1, -1, -1):
        if out[i].string == string:
            prev = out[i]
            if end > prev.end:
                out[i] = SongNote(
                    string=prev.string,
                    fret=prev.fret,
                    start=prev.start,
                    duration=end - prev.start,
                    dead=prev.dead,
                )
            return
    # A tie with nothing to tie to is a malformed file, not a crash: the note it
    # continues is simply absent, so there is nothing to extend and nothing to draw.
