/**
 * OverlayCanvas: the per-frame render loop drawing dots/grid over the live video,
 * and the calibration tap-capture surface.
 *
 * Per-frame work is trivial (PRD §5.2): the cached homography and selected
 * positions are reapplied each frame — NO per-frame computer vision in M1.
 *
 * Coordinates: H maps fretboard-space (u,v) → NORMALIZED display space [0,1].
 * We multiply by the canvas CSS size to get pixels, so alignment survives window
 * resizes (PRD A2) and a stored calibration reproduces exactly on reload (B2).
 */

import { useEffect, useRef, type RefObject } from 'react';
import { useStore } from './store';
import { resolveSelection } from '../core/content';
import {
  applyHomography,
  calibrationTargets,
  dotUV,
  fretU,
  getPerspectiveTransform,
  gridLines,
} from '../core/geometry';
import type { Point, StringNumber, UV } from '../core/types';

const COLORS = {
  dot: 'rgba(56, 132, 255, 0.55)',
  dotRing: 'rgba(56, 132, 255, 0.95)',
  root: 'rgba(255, 138, 0, 0.6)',
  rootRing: 'rgba(255, 138, 0, 1)',
  label: '#ffffff',
  open: 'rgba(60, 220, 130, 0.95)',
  muted: 'rgba(255, 80, 80, 0.95)',
  grid: 'rgba(255, 255, 255, 0.22)',
  gridPreview: 'rgba(120, 230, 160, 0.7)',
  tap: 'rgba(255, 220, 0, 0.95)',
};

interface OverlayCanvasProps {
  canvasRef: RefObject<HTMLCanvasElement>;
}

export function OverlayCanvas({ canvasRef }: OverlayCanvasProps) {
  // The loop reads live values from the store on each frame to avoid stale
  // closures; it only needs to be set up once.
  const addTap = useStore((s) => s.addTap);
  const animationRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let running = true;

    const frame = () => {
      if (!running) return;
      const cssW = canvas.clientWidth;
      const cssH = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      const wantW = Math.round(cssW * dpr);
      const wantH = Math.round(cssH * dpr);
      if (canvas.width !== wantW || canvas.height !== wantH) {
        canvas.width = wantW;
        canvas.height = wantH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cssW, cssH);

      if (cssW > 0 && cssH > 0) {
        draw(ctx, cssW, cssH);
      }
      animationRef.current = requestAnimationFrame(frame);
    };
    animationRef.current = requestAnimationFrame(frame);

    return () => {
      running = false;
      cancelAnimationFrame(animationRef.current);
    };
  }, [canvasRef]);

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const st = useStore.getState();
    if (!st.calibrating || st.draftTaps.length >= 4) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    addTap({ x: clamp01(x), y: clamp01(y) });
  };

  return (
    <canvas
      ref={canvasRef}
      className="stage-canvas"
      onPointerDown={onPointerDown}
    />
  );
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/** Normalized (u,v) → CSS pixel using H and the current canvas size. */
function toPixel(H: number[][], uv: UV, cssW: number, cssH: number): Point {
  const n = applyHomography(H, uv);
  return { x: n.x * cssW, y: n.y * cssH };
}

/** Radius for finger dots, scaled to the canvas. */
function dotRadius(cssW: number, cssH: number): number {
  return Math.max(8, Math.min(cssW, cssH) * 0.026);
}

function draw(ctx: CanvasRenderingContext2D, cssW: number, cssH: number) {
  const st = useStore.getState();

  if (st.calibrating) {
    drawCalibrationDraft(ctx, cssW, cssH, st.draftTaps, st.draftFarFret);
    return;
  }

  const cal = st.calibration;
  if (!cal) return;

  if (st.showGrid) {
    drawGrid(ctx, cal.H, cal.farFret, cssW, cssH, COLORS.grid, 1);
  }

  const resolved = resolveSelection(st.selection);
  if (resolved) {
    drawSelection(ctx, cal.H, cssW, cssH, resolved);
  }
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  H: number[][],
  maxFret: number,
  cssW: number,
  cssH: number,
  color: string,
  width: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth = width;
  for (const line of gridLines(H, maxFret)) {
    ctx.beginPath();
    ctx.moveTo(line.from.x * cssW, line.from.y * cssH);
    ctx.lineTo(line.to.x * cssW, line.to.y * cssH);
    ctx.stroke();
  }
  ctx.restore();
}

interface Resolved {
  positions: {
    string: StringNumber;
    fret: number;
    finger?: 1 | 2 | 3 | 4;
    isRoot?: boolean;
  }[];
  open: StringNumber[];
  muted: StringNumber[];
}

function drawSelection(
  ctx: CanvasRenderingContext2D,
  H: number[][],
  cssW: number,
  cssH: number,
  resolved: Resolved,
) {
  const r = dotRadius(cssW, cssH);

  // Open-string roots (encoded as fret-0 positions) get emphasized markers.
  const rootOpenStrings = new Set(
    resolved.positions
      .filter((p) => p.fret === 0 && p.isRoot)
      .map((p) => p.string),
  );

  // O / X markers behind the nut.
  for (const s of resolved.open) {
    const p = toPixel(H, dotUV(s, 0), cssW, cssH);
    drawOpenMarker(ctx, p, r * 0.8, rootOpenStrings.has(s));
  }
  for (const s of resolved.muted) {
    const p = toPixel(H, dotUV(s, 0), cssW, cssH);
    drawMutedMarker(ctx, p, r * 0.7);
  }

  // Finger dots (fret ≥ 1).
  for (const pos of resolved.positions) {
    if (pos.fret < 1) continue;
    const p = toPixel(H, dotUV(pos.string, pos.fret), cssW, cssH);
    drawDot(ctx, p, r, pos.isRoot ?? false, pos.finger);
  }
}

/** Semi-transparent ring + translucent fill so hand-occluded dots stay readable. */
function drawDot(
  ctx: CanvasRenderingContext2D,
  p: Point,
  r: number,
  isRoot: boolean,
  finger?: 1 | 2 | 3 | 4,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.fillStyle = isRoot ? COLORS.root : COLORS.dot;
  ctx.fill();
  ctx.lineWidth = isRoot ? 4 : 2.5;
  ctx.strokeStyle = isRoot ? COLORS.rootRing : COLORS.dotRing;
  ctx.stroke();

  if (finger) {
    ctx.fillStyle = COLORS.label;
    ctx.font = `bold ${Math.round(r * 1.15)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(finger), p.x, p.y + r * 0.04);
  }
  ctx.restore();
}

function drawOpenMarker(
  ctx: CanvasRenderingContext2D,
  p: Point,
  r: number,
  isRoot: boolean,
) {
  ctx.save();
  ctx.beginPath();
  ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
  ctx.lineWidth = isRoot ? 4 : 2.5;
  ctx.strokeStyle = isRoot ? COLORS.rootRing : COLORS.open;
  ctx.stroke();
  ctx.restore();
}

function drawMutedMarker(ctx: CanvasRenderingContext2D, p: Point, r: number) {
  ctx.save();
  ctx.strokeStyle = COLORS.muted;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(p.x - r, p.y - r);
  ctx.lineTo(p.x + r, p.y + r);
  ctx.moveTo(p.x + r, p.y - r);
  ctx.lineTo(p.x - r, p.y + r);
  ctx.stroke();
  ctx.restore();
}

function drawCalibrationDraft(
  ctx: CanvasRenderingContext2D,
  cssW: number,
  cssH: number,
  taps: { x: number; y: number }[],
  farFret: number,
) {
  // Once all 4 taps are in, preview the full grid so the user can sanity-check.
  if (taps.length === 4) {
    try {
      const targets = calibrationTargets(farFret);
      const H = getPerspectiveTransform(
        targets,
        taps.map((t) => ({ x: t.x, y: t.y })),
      );
      drawGrid(ctx, H, farFret, cssW, cssH, COLORS.gridPreview, 1.5);
      // Emphasize nut and far-fret lines.
      drawGridLine(ctx, H, fretU(0), cssW, cssH);
      drawGridLine(ctx, H, fretU(farFret), cssW, cssH);
    } catch {
      /* degenerate taps; markers below still show what was tapped */
    }
  }

  // Numbered tap markers.
  taps.forEach((t, i) => {
    const x = t.x * cssW;
    const y = t.y * cssH;
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = COLORS.tap;
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.fillStyle = '#000';
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), x, y + 1);
    ctx.restore();
  });
}

function drawGridLine(
  ctx: CanvasRenderingContext2D,
  H: number[][],
  u: number,
  cssW: number,
  cssH: number,
) {
  const a = toPixel(H, { u, v: 0 }, cssW, cssH);
  const b = toPixel(H, { u, v: 1 }, cssW, cssH);
  ctx.save();
  ctx.strokeStyle = COLORS.gridPreview;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.stroke();
  ctx.restore();
}
