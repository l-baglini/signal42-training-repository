"""Getting sound out of the machine.

The thin, untestable half of the audio path. :mod:`fretguide.synth` makes the
waveform and is pure; this owns a device, so it is to audio what
``capture.py`` is to video and it gets the same treatment — keep it small, keep
the decisions out of it, and do not pretend a test covers it.

**The stream is the clock.** Once audio is playing it drives the play head
rather than the other way round: a sound card's position advances at a rate set
by a crystal, while a video frame's timestamp is whatever the pipeline managed.
Integrating frame deltas alongside audio would let the dots and the sound drift
apart, and a dot that disagrees with what you hear is worse than a silent one.
See :meth:`Transport.follow`.
"""

from __future__ import annotations

import numpy as np

from .synth import SAMPLE_RATE


class AudioUnavailable(RuntimeError):
    """No device, or no `sounddevice`. Never fatal — the overlay is the product,
    audio is an accompaniment, and losing it must not stop the app."""


class Player:
    """Plays one buffer on a loop, and reports where it has got to."""

    def __init__(self, samples: np.ndarray, sr: int = SAMPLE_RATE, device=None) -> None:
        try:
            import sounddevice
        except ImportError as exc:
            raise AudioUnavailable(
                "audio needs the [audio] extra: pip install -e '.[audio]'"
            ) from exc

        self.sr = sr
        self.playing = False
        self._samples = np.ascontiguousarray(samples, dtype=np.float32)
        # Written by the audio callback and read by the display loop. A plain
        # int assignment is atomic under the GIL, which is the whole of the
        # synchronisation needed: a reader that is one block stale is showing a
        # position a few milliseconds old, and nothing here is worth a lock in
        # a real-time callback.
        self._pos = 0
        try:
            self._stream = sounddevice.OutputStream(
                samplerate=sr, channels=1, dtype="float32",
                callback=self._fill, device=device,
            )
            self._stream.start()
        except Exception as exc:  # sounddevice raises several unrelated types
            raise AudioUnavailable(f"could not open an audio output: {exc}") from exc

    # ------------------------------------------------------------- callback

    def _fill(self, out, frames, _time, _status) -> None:
        if not self.playing or len(self._samples) < 2:
            out[:] = 0.0
            return
        pos, total = self._pos, len(self._samples)
        end = pos + frames
        if end <= total:
            out[:, 0] = self._samples[pos:end]
        else:
            # Wrap rather than stop: the transport loops, so the audio must too,
            # and doing it here keeps the two from disagreeing about where the
            # end of the song is.
            first = total - pos
            out[:first, 0] = self._samples[pos:]
            out[first:, 0] = self._samples[: frames - first]
        self._pos = end % total

    # --------------------------------------------------------------- control

    @property
    def position(self) -> float:
        """Seconds into the buffer. This is the master clock."""
        return self._pos / self.sr

    def seek(self, seconds: float) -> None:
        total = max(len(self._samples), 1)
        self._pos = int(np.clip(seconds, 0.0, total / self.sr - 1e-6) * self.sr) % total

    def replace(self, samples: np.ndarray, keep: float | None = None) -> None:
        """Swap the buffer — for a tempo change — landing at ``keep`` seconds."""
        self._samples = np.ascontiguousarray(samples, dtype=np.float32)
        self._pos = 0
        if keep is not None:
            self.seek(keep)

    def start(self) -> None:
        self.playing = True

    def stop(self) -> None:
        self.playing = False

    def close(self) -> None:
        self.playing = False
        stream = getattr(self, "_stream", None)
        if stream is not None:
            try:
                stream.stop()
                stream.close()
            except Exception:
                pass  # closing a device that already went away is not an error
            self._stream = None

    def __enter__(self) -> Player:
        return self

    def __exit__(self, *_exc) -> None:
        self.close()
