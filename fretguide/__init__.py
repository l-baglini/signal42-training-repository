"""FretGuide — finger-placement overlays on live video of your own fretboard.

Layers, lowest first:
  types    — domain types and invariants
  geometry — fret rule + homography (fretboard space <-> image pixels)
  theory   — note maths, scale/chord sets, neck-wide scale generation
  content  — curated chord voicings and scale boxes, selection resolution

Everything here is pure and framework-free. Capture, tracking and rendering sit above
it. See docs/PRD-v2.md for scope and docs/research/ for the reasoning.
"""

from . import content, geometry, theory, types  # noqa: F401

__all__ = ["content", "geometry", "theory", "types"]
