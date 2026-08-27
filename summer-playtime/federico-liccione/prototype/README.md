# The prototype that came before the spec

One self-contained page, no build, no dependencies beyond MediaPipe from a CDN.
It exists because the mechanic had to be felt before it was worth specifying, and
because the two pieces of mathematics the game rests on are easier to validate
here than inside a game loop.

```
python3 -m http.server 8137 --bind 127.0.0.1
# then open http://localhost:8137/headtracked-parallax.html
```

`localhost`, not `file://` — `getUserMedia` refuses to run outside a secure
context.

## What it validated

- **The off-axis frustum.** Kooima's formulation over a depth-displaced relief.
  Now ported and under test as `src/render/projection.ts` and I10.
- **Metric head position from a webcam.** MediaPipe iris landmarks (indices 468
  and 473) and the inter-pupillary estimate. This is also what supplies the
  metric anchor for the room scan — see SPEC §7.2.
- **That the mechanic reads at all.** Press `o` to swap the off-axis frustum for
  a symmetric one at the same camera position. The window becomes a dolly and the
  illusion dies on the spot. That toggle ships (SPEC §8) and its behaviour is
  asserted in `tests/projection.test.ts`.

## What it is not

Not the game. The depth map is procedural and static, generated alongside the RGB
so the two are aligned by construction; in the real pipeline a monocular depth
model replaces it and the maths above is unchanged. Mouse mode stands in for head
tracking so the geometry can be judged without the tracker in the way — start
there, it is the cleaner control.

Calibrate `Largh. finestra` against a real ruler with `r` before judging
anything: if the physical screen width is wrong, the parallax has the wrong
magnitude and the illusion does not lock.
