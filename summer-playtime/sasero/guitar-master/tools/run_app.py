#!/usr/bin/env python3
"""FretGuide — finger-placement dots on live video of a fretboard.

    python tools/run_app.py                            # no camera needed: a synthetic neck
    python tools/run_app.py -d 4                       # trained model on camera 4
    python tools/run_app.py -d 4 --source enrollment   # the old match-to-reference path
    python tools/run_app.py --source replay            # the labelled dataset, exact poses

Sources (``--source``, default ``auto``):

  synthetic   A fretboard drawn from a matrix, moving. **Needs no camera, no trained
              model and no dataset**, so the whole app -- chords, scales, the grid, the
              trust gate -- can be driven anywhere. The pose is exact by construction, so
              a dot in the wrong place here is the renderer's fault and nothing else's.
  model       A trained net finds the fretboard in every frame from scratch. Nothing to
              click, nothing stuck to the guitar, no reference image. Move the guitar,
              put it down and pick it up -- each frame is posed on its own, so there is
              nothing to lose lock on.
  enrollment  The earlier path: SIFT-match each frame against one enrolled reference
              photo. Kept because it needs no trained model, but it must be re-enrolled
              whenever the camera or the lighting changes, and that rigidity is exactly
              what the model source exists to remove.
  replay      The labelled dataset, posed from its labels. Real footage, exact geometry.
  auto        model if models/fretnet.xml exists, else enrollment if an enrolment file
              does, else synthetic -- so this always starts, whatever the machine has.

Keys
  TAB       open/close the practice menu (arrows or mouse; Esc or Tab to close)
  1..7      chords: G Am Bm C D Em F#dim
  s         cycle curated scale boxes
  a         cycle generated scales (any root, whole neck)
  g         toggle the fret/string grid
  f         toggle finger numbers
  c         toggle colour (sources that provide chroma)
  m         toggle mirror (if you prefer a mirror-image view)
  d         toggle debug (predicted keypoints and board outline)
  - / =     shrink / grow the dots
  SPACE     freeze/unfreeze
  r         reset temporal smoothing
  q / ESC   quit

The overlay is composited on the frame its pose was computed from, and nothing is drawn
unless the pose passes the trust gate — a dimmed frame with NO LOCK is correct behaviour,
not a bug. v1's failure mode was confidently drawing a wrong overlay.
"""

from __future__ import annotations

import argparse
import sys
import time
from collections import deque
from pathlib import Path

import cv2
import numpy as np

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # repo root, so `fretguide` imports

from fretguide import render
from fretguide.content import CHORD_IDS, SCALE_IDS, resolve_selection
from fretguide.geometry import grid_lines
from fretguide.menu import Layout, Menu, preferred_anchor
from fretguide.source import STRAT_FRETS, open_source
from fretguide.transport import Transport
from fretguide.types import Selection

# X11 keysyms, which is what cv2.waitKeyEx reports on the Qt backend this ships with.
# waitKey (no Ex) collapses all four to 0, so arrow keys are unusable without it.
ARROWS = {65361: "left", 65362: "up", 65363: "right", 65364: "down",
          2424832: "left", 2490368: "up", 2555904: "right", 2621440: "down"}

GENERATED = [
    "G major", "E minor", "A minor pentatonic", "E minor pentatonic",
    "C major", "A major", "D dorian", "E blues", "A major pentatonic",
]


def load_song(args, max_fret: int) -> Transport:
    """Open --song, pick a track, and hand back a play head over it.

    Bass and drums are filtered out rather than offered: they have the wrong
    string count or no fretboard at all, and putting them on a six-string neck
    would draw confident nonsense.
    """
    from fretguide.score import read_guitarpro

    song = read_guitarpro(args.song)
    playable = [t for t in song.tracks if t.playable]
    if not playable:
        raise SystemExit(f"{args.song}: no six-string guitar track to play")

    print(f"\n{song.title} — {song.artist}   {len(song.bars)} bars, "
          f"{song.tempos[0].bpm:g} bpm")
    for i, tr in enumerate(song.tracks):
        why = "" if tr.playable else ("  [drums]" if tr.percussion else f"  [{tr.string_count} strings]")
        reach = "" if tr.fits_camera else f"  {tr.frets_above_camera:.0%} above fret {12}"
        print(f"  {i:>2}  {tr.name[:24]:24} {len(tr.notes):>5} notes  max fret {tr.max_fret:>2}"
              f"{reach}{why}")

    track = song.tracks[args.track] if args.track is not None else playable[0]
    if not track.playable:
        raise SystemExit(f"track {args.track} ({track.name}) is not a six-string guitar part")

    if args.refinger:
        from dataclasses import replace

        from fretguide.fingering import Hand, solve, to_pitches
        result = solve(to_pitches(track.notes), Hand(max_fret=max_fret))
        print(f"\nre-fingered for a {max_fret}-fret neck: {len(result.notes)} notes"
              + (f", {result.unplayable} out of reach" if result.unplayable else ""))
        track = replace(track, notes=result.notes)

    if track.max_fret > max_fret:
        print(f"\n  NOTE: {track.name} reaches fret {track.max_fret} but this neck ends at "
              f"{max_fret}. Those notes will not be drawn — try --refinger, or "
              f"--max-fret {min(24, track.max_fret)} on the synthetic source.")
    print(f"\nplaying: {track.name}   p = play/pause, [ ] = bar, - = = speed, 0 = restart\n")
    return Transport(song=song, track=track, playing=True)


def start_audio(args, song):
    """Render the part and open an output. Never fatal: no audio is a lesser
    failure than no overlay, so a missing device downgrades to silence."""
    from fretguide.audio import AudioUnavailable, Player
    from fretguide.fingering import STANDARD_TUNING
    from fretguide.synth import SAMPLE_RATE, render

    t0 = time.perf_counter()
    mix = render(song.track.notes, song.song, STANDARD_TUNING, rate=song.rate)
    took = (time.perf_counter() - t0) * 1000
    try:
        player = Player(mix, SAMPLE_RATE, device=args.audio_device)
    except AudioUnavailable as exc:
        print(f"  audio off: {exc}")
        return None
    player.start()
    song.playing = True
    print(f"  audio: {len(mix) / SAMPLE_RATE:.0f} s synthesised in {took:.0f} ms")
    return player


def restart_audio(player, song):
    """Re-mix after a tempo change and land where we already were.

    Re-mixing is addition over a cached pluck per pitch, so it is milliseconds;
    re-synthesising every note would not be, and the speed keys would stutter.
    """
    from fretguide.fingering import STANDARD_TUNING
    from fretguide.synth import render

    at = song.song.seconds_at(song.beat) / song.rate
    player.replace(render(song.track.notes, song.song, STANDARD_TUNING, rate=song.rate), keep=at)


def resolve_auto(args) -> str:
    """Pick a source for ``--source auto``.

    Falls through to synthetic rather than failing. A first run on a machine with no
    camera, no model and no dataset should still show you what the app does; the older
    behaviour was to print an error and exit, which taught nobody anything.
    """
    if Path(args.model).exists() and args.device is not None:
        return "model"
    if Path(args.enrollment).exists() and args.device is not None:
        return "enrollment"
    return "synthetic"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--source", default="auto",
                    choices=("auto", "synthetic", "model", "enrollment", "replay"))
    ap.add_argument("-d", "--device", default=None,
                    help="camera device; required by the model and enrollment sources")
    ap.add_argument("--size", default="1920x1080")
    ap.add_argument("--model", default="models/fretnet.xml")
    ap.add_argument("--infer-device", default="AUTO",
                    help="OpenVINO device: AUTO, CPU, GPU, NPU (see tools/export.py)")
    ap.add_argument("--max-fret", type=int, default=None,
                    help="how many frets the neck has. Defaults to 12 for a camera, which "
                         "is all the model can pose, and to a Stratocaster's 21 for the "
                         "synthetic neck. Use 22 for a modern Strat")
    ap.add_argument("--min-conf", type=float, default=0.15)
    ap.add_argument("--dot-scale", type=float, default=1.0,
                    help="dot size multiplier; also adjustable live with - and =")
    ap.add_argument("--enrollment", default="enrollment.npz")
    ap.add_argument("--display-width", type=int, default=1280)
    ap.add_argument("--match-width", type=int, default=1280,
                    help="enrollment source: width frames are downscaled to for SIFT")
    ap.add_argument("--rematch-ms", type=float, default=150.0)
    ap.add_argument("--greyscale", action="store_true",
                    help="skip the chroma planes; also toggled live with c")
    ap.add_argument("--motion", action="store_true",
                    help="synthetic: let the neck drift. It holds still otherwise — the "
                         "movement is there to prove the overlay tracks, not to practise "
                         "against")
    ap.add_argument("--refuse-every", type=int, default=0,
                    help="synthetic: periodically refuse the pose, to exercise NO LOCK")
    ap.add_argument("--frames", type=int, default=0,
                    help="quit after N frames (0 = run until told to stop). Makes the "
                         "app scriptable: a smoke test or a throughput measurement "
                         "otherwise needs a human to press q")
    ap.add_argument("--headless", action="store_true",
                    help="do everything except open a window — for measuring the loop, "
                         "and for machines with no display")
    ap.add_argument("--song", default=None,
                    help="a Guitar Pro file to play along to (needs the [score] extra)")
    ap.add_argument("--track", type=int, default=None,
                    help="which track of --song; omit to list them and pick the first guitar")
    ap.add_argument("--refinger", action="store_true",
                    help="discard the tab's fingering and re-solve it, which is how a part "
                         "written above fret 12 can be brought into camera range")
    ap.add_argument("--audio", action="store_true",
                    help="synthesise the part and play it in time with the dots "
                         "(needs the [audio] extra)")
    ap.add_argument("--audio-device", default=None,
                    help="output device for --audio; omit for the system default")
    ap.add_argument("--debug", action="store_true")
    ap.add_argument("--no-smooth", action="store_true")
    args = ap.parse_args()

    kind = resolve_auto(args) if args.source == "auto" else args.source
    if args.source == "auto":
        print(f"source: {kind} (auto)")

    # The model predicts 26 keypoints -- two per fret wire, nut through fret 12 -- so a
    # camera cannot be posed past 12 however long the real neck is. Only the synthetic
    # backdrop is free to show the rest of the instrument.
    tracked_max = 12
    if args.max_fret is None:
        max_fret = STRAT_FRETS if kind == "synthetic" else tracked_max
    else:
        max_fret = args.max_fret
    if kind in ("model", "enrollment", "replay") and max_fret > tracked_max:
        print(f"--max-fret {max_fret} is past fret {tracked_max}, which is as far as the "
              f"model poses; using {tracked_max}")
        max_fret = tracked_max
    if kind in ("model", "enrollment") and args.device is None:
        print(f"the {kind} source needs a camera:  --source {kind} -d 4")
        print("no camera to hand?  python tools/run_app.py --source synthetic")
        return 2

    w, h = (int(x) for x in args.size.lower().split("x"))
    try:
        src = open_source(
            kind, device=args.device, width=w, height=h, max_fret=max_fret,
            model_path=args.model, infer_device=args.infer_device, min_conf=args.min_conf,
            enrollment=args.enrollment, match_width=args.match_width,
            rematch_ms=args.rematch_ms, smooth=not args.no_smooth,
            colour=not args.greyscale, refuse_every=args.refuse_every, fps=30.0,
            motion=args.motion,
        )
    except (FileNotFoundError, OSError, RuntimeError, ValueError) as e:
        print(e)
        if kind == "model":
            print("Train one:   python tools/train.py")
            print("Export it:   python tools/export.py --checkpoint models/best.pt")
        elif kind == "enrollment":
            print("Run tools/enroll.py first.")
        print("\nOr drive the app with no hardware at all:")
        print("  python tools/run_app.py --source synthetic")
        return 1

    max_fret = getattr(src, "max_fret", max_fret)
    song = load_song(args, max_fret) if args.song else None
    player = start_audio(args, song) if (song and args.audio) else None
    sel = Selection("chord", "G")
    scale_i = gen_i = 0
    show_grid, show_fingers, mirror, frozen = True, True, False, False
    colour = not args.greyscale
    debug = args.debug
    dot_scale = float(args.dot_scale)
    frame_times: deque[float] = deque(maxlen=40)
    held = None
    song_t: float | None = None

    print(__doc__)
    win = "FretGuide"
    if not args.headless:
        cv2.namedWindow(win, cv2.WINDOW_NORMAL | cv2.WINDOW_GUI_NORMAL)
        cv2.resizeWindow(win, args.display_width,
                         int(args.display_width * src.height / src.width))
    menu = Menu(max_fret=max_fret)
    menu.sync_to(sel)
    layout = Layout.for_frame(src.width, src.height)
    click: list[tuple[int, int]] = []

    def place_menu(H) -> Layout:
        """Anchor the panel to whichever side hides less of the neck."""
        points = None
        if H is not None:
            # The whole fret grid, not just the four corners: the panel can clear every
            # corner and still sit over the middle of the neck.
            points = np.array([[p.x, p.y] for line in grid_lines(H, max_fret) for p in line])
        return Layout.for_frame(src.width, src.height,
                                preferred_anchor(points, src.width, src.height, menu))

    def on_mouse(event, x, y, flags, _param) -> None:
        # Only record the click here. Acting on it from the callback would mutate the
        # menu from OpenCV's UI thread while the draw loop is reading it.
        if event == cv2.EVENT_LBUTTONDOWN:
            click.append((x, y))

    if not args.headless:
        cv2.setMouseCallback(win, on_mouse)

    shown = 0
    try:
        while True:
            t_loop = time.perf_counter()
            if not frozen or held is None:
                packet = src.read()
                if packet is None:
                    print("source ended")
                    break
                held = packet
            packet = held

            # to_bgr widens greyscale for us, so `colour` only decides whether the chroma
            # planes are spent — the drawing code below never learns which it got.
            view = packet.to_bgr() if colour else cv2.cvtColor(packet.gray, cv2.COLOR_GRAY2BGR)
            if song is not None:
                # Driven by the frame's own timestamp, not a wall clock, so
                # freezing the picture freezes the play head with it: `held`
                # replays the same packet, the delta is zero, and the song
                # stops where the frame did.
                if player is not None and song.playing:
                    # The stream is the clock. Integrating frame deltas as well
                    # would let the dots drift away from the sound, and a dot
                    # that disagrees with what you hear is worse than a mute one.
                    song.follow(player.position)
                else:
                    song.tick(packet.t - (song_t if song_t is not None else packet.t))
                song_t = packet.t
                resolved = song.resolved()
            else:
                resolved = resolve_selection(sel, max_fret=max_fret)
            name = resolved.name if resolved else f"<unknown: {sel.id}>"

            if packet.H is not None and resolved is not None:
                if show_grid:
                    render.draw_grid(view, packet.H, max_fret)
                render.draw_selection(view, packet.H, resolved, show_fingers=show_fingers,
                                      dot_scale=dot_scale)
                if debug:
                    render.draw_debug(view, packet.H, max_fret, packet.debug_pts)
            else:
                render.dim(view, 0.5)
                if debug:
                    for x, y in packet.debug_pts:
                        cv2.circle(view, (int(x), int(y)), 3, (0, 200, 255), -1, cv2.LINE_AA)

            frame_times.append(time.perf_counter() - t_loop)
            fps = 1.0 / max(float(np.mean(frame_times)), 1e-6)
            tail = "FROZEN " if frozen else ""
            tail += " ".join(f"{k} {v}" for k, v in (packet.status.fields or {}).items())
            if abs(dot_scale - 1.0) > 1e-6:
                tail += f"  dots x{dot_scale:.1f}"
            render.draw_hud(view, packet.status, name, fps, extra=tail)
            if menu.open:
                render.draw_menu(view, menu, layout)
            if mirror:
                view = cv2.flip(view, 1)

            shown += 1
            if args.frames and shown >= args.frames:
                break
            if args.headless:
                continue
            cv2.imshow(win, view)

            while click:
                cx, cy = click.pop(0)
                if mirror:
                    cx = src.width - cx  # the frame was flipped after the menu was drawn
                if not menu.open:
                    continue
                spot = layout.hit(cx, cy, menu)
                if spot is None:
                    menu.open = False  # clicking the video dismisses the menu
                elif menu.click(*spot) and (chosen := menu.selection()):
                    sel = chosen

            key = cv2.waitKeyEx(1)
            if (arrow := ARROWS.get(key)) and menu.open:
                if arrow in ("up", "down"):
                    menu.move(-1 if arrow == "up" else 1)
                elif arrow == "right":
                    menu.descend()
                else:
                    menu.ascend()
                if (chosen := menu.selection()):
                    sel = chosen
                continue

            k = key & 0xFF if key != -1 else 255
            was = sel
            if k == 9:  # Tab
                menu.toggle()
                if menu.open:
                    # Opening is the one time the menu may take the focus: landing on the
                    # leaf you are already playing is the point of opening it.
                    menu.sync_to(sel, keep_focus=False)
                    layout = place_menu(packet.H)
            elif k == 27 and menu.open:
                menu.open = False
            elif k in (27, ord("q")):
                break
            elif song is not None and k == ord("p"):
                song.toggle()
                if player is not None:
                    player.start() if song.playing else player.stop()
            elif song is not None and k in (ord("["), ord("]"), ord("0")):
                if k == ord("0"):
                    song.seek(0.0)
                else:
                    song.nudge_bars(-1 if k == ord("[") else 1)
                if player is not None:
                    player.seek(song.song.seconds_at(song.beat) / song.rate)
            elif song is not None and k in (ord("-"), ord("="), ord("+")):
                song.scale_rate(1 / 1.25 if k == ord("-") else 1.25)
                if player is not None:
                    restart_audio(player, song)
            elif ord("1") <= k <= ord("7"):
                sel = Selection("chord", CHORD_IDS[k - ord("1")])
            elif k == ord("s"):
                sel = Selection("scale", SCALE_IDS[scale_i % len(SCALE_IDS)])
                scale_i += 1
            elif k == ord("a"):
                sel = Selection("scale_generated", GENERATED[gen_i % len(GENERATED)])
                gen_i += 1
            elif k == ord("g"):
                show_grid = not show_grid
            elif k == ord("f"):
                show_fingers = not show_fingers
            elif k == ord("c"):
                colour = not colour
            elif k == ord("m"):
                mirror = not mirror
            elif k == ord("d"):
                debug = not debug
            elif k in (ord("-"), ord("_")):
                dot_scale = max(0.4, dot_scale - 0.1)
            elif k in (ord("="), ord("+")):
                dot_scale = min(2.5, dot_scale + 0.1)
            elif k == ord(" "):
                frozen = not frozen
            elif k == ord("r"):
                src.reset()
            # Only when a hotkey moved the selection behind the menu's back. Syncing every
            # frame -- which this used to do -- meant the menu was rebuilt from `sel`
            # continuously, so the cursor could never rest anywhere `sel` did not point.
            if menu.open and sel != was:
                menu.sync_to(sel)
    except KeyboardInterrupt:
        # Ctrl-C is a normal way to stop this, especially when it is driving a synthetic
        # source from a terminal. Without this the summary below is skipped and the user
        # gets a traceback for having quit.
        print()
    finally:
        src.close()
        cv2.destroyAllWindows()

    if (summary := src.summary()):
        print(f"\n{summary}")
    if player is not None:
        player.close()
    if frame_times:
        print(f"display loop: {1.0 / float(np.mean(frame_times)):.1f} fps mean "
              f"over {shown} frames")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
