/**
 * Part 2: (a) remaining failure modes of the CURRENT design, and
 *         (b) the accuracy a MARKERLESS fretboard-keypoint detector would need.
 */
import { Matrix, solve, inverse } from 'ml-matrix';

const F = 500, CX = 320, CY = 240;
const L = 0.648, NECK_W = 0.045, BODY_OFFSET = 0.018;
const fretU = (n) => 1 - Math.pow(2, -n / 12);

// ---- seeded gaussian ----
let _s = 12345;
const rnd = () => { _s = (_s * 1103515245 + 12345) & 0x7fffffff; return _s / 0x7fffffff; };
const gauss = () => { const u = Math.max(rnd(), 1e-9), v = rnd(); return Math.sqrt(-2*Math.log(u))*Math.cos(2*Math.PI*v); };
const reseed = (n) => { _s = n; };

// ---- projection, with optional unmodelled radial distortion ----
let K1 = 0; // radial distortion coefficient of the REAL lens
function project(p) {
  const xn = p[0] / p[2], yn = p[1] / p[2];
  const r2 = xn * xn + yn * yn;
  const d = 1 + K1 * r2;
  return { x: CX + F * xn * d, y: CY + F * yn * d };
}

const rx = (a) => [[1,0,0],[0,Math.cos(a),-Math.sin(a)],[0,Math.sin(a),Math.cos(a)]];
const ry = (a) => [[Math.cos(a),0,Math.sin(a)],[0,1,0],[-Math.sin(a),0,Math.cos(a)]];
const rz = (a) => [[Math.cos(a),-Math.sin(a),0],[Math.sin(a),Math.cos(a),0],[0,0,1]];
const mm = (A,B) => A.map((r,i)=>B[0].map((_,j)=>r.reduce((s,_,k)=>s+A[i][k]*B[k][j],0)));
const mv = (A,v) => A.map((r)=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const deg = (d) => (d*Math.PI)/180;

const R0 = mm(mm(rz(deg(-18)), ry(deg(28))), rx(deg(6)));
const T0 = [-0.16, 0.02, 0.72];
const world = (R,T,l) => add(mv(R,l), T);
const fbLocal = (u,v) => [u*L, (v-0.5)*NECK_W, 0];
const bodyLocal = (u,y) => [u*L, y, -BODY_OFFSET];

function solveH(src, dst) {
  const a = [], b = [];
  for (let i = 0; i < src.length; i++) {
    const [u,v] = src[i], {x,y} = dst[i];
    a.push([u,v,1,0,0,0,-u*x,-v*x]); b.push(x);
    a.push([0,0,0,u,v,1,-u*y,-v*y]); b.push(y);
  }
  const h = solve(new Matrix(a), Matrix.columnVector(b)).to1DArray();
  return [[h[0],h[1],h[2]],[h[3],h[4],h[5]],[h[6],h[7],1]];
}
const applyH = (H,u,v) => { const w=H[2][0]*u+H[2][1]*v+H[2][2];
  return {x:(H[0][0]*u+H[0][1]*v+H[0][2])/w, y:(H[1][0]*u+H[1][1]*v+H[1][2])/w}; };
function imageToFb(H,p){ const Hi=inverse(new Matrix(H)).to2DArray();
  const w=Hi[2][0]*p.x+Hi[2][1]*p.y+Hi[2][2];
  return [(Hi[0][0]*p.x+Hi[0][1]*p.y+Hi[0][2])/w,(Hi[1][0]*p.x+Hi[1][1]*p.y+Hi[1][2])/w]; }

/** error of a fitted H against ground truth pose, in fret-widths, frets 1..12 */
function evalH(H, R, T) {
  let worst = 0, sum = 0, n = 0;
  for (let f = 1; f <= 12; f++) {
    const u = (fretU(f-1) + fretU(f)) / 2;
    for (let s = 0; s < 6; s++) {
      const v = s/5;
      const got = applyH(H,u,v), want = project(world(R,T,fbLocal(u,v)));
      const a = project(world(R,T,fbLocal(fretU(f-1),v))), b = project(world(R,T,fbLocal(fretU(f),v)));
      const fw = Math.hypot(a.x-b.x, a.y-b.y);
      const e = Math.hypot(got.x-want.x, got.y-want.y)/fw;
      worst = Math.max(worst,e); sum += e; n++;
    }
  }
  return { mean: sum/n, worst };
}

// =====================================================================
console.log('=== A. REMAINING FAILURE MODES OF THE CURRENT DESIGN ===\n');

const MK = 0.04;
function bodyMarkers(count) {
  const centres = [[0.72,-0.06],[0.72,0.06],[0.86,0.0]].slice(0, count);
  return centres.flatMap(([u,y]) => [
    bodyLocal(u-MK/2/L, y-MK/2), bodyLocal(u+MK/2/L, y-MK/2),
    bodyLocal(u+MK/2/L, y+MK/2), bodyLocal(u-MK/2/L, y+MK/2)]);
}
const calibUV = [[fretU(0),0],[fretU(0),1],[fretU(12),1],[fretU(12),0]];

function runMarkerCase(count, jitter, R, T, trials = 20) {
  const pts = bodyMarkers(count);
  const H0 = solveH(calibUV, calibUV.map(([u,v]) => project(world(R0,T0,fbLocal(u,v)))));
  const anchors = pts.map((p) => imageToFb(H0, project(world(R0,T0,p))));
  let m = 0, w = 0;
  for (let t = 0; t < trials; t++) {
    reseed(1000 + t * 77);
    const obs = pts.map((p) => { const q = project(world(R,T,p));
      return { x: q.x + jitter*gauss(), y: q.y + jitter*gauss() }; });
    const r = evalH(solveH(anchors, obs), R, T);
    m += r.mean; w = Math.max(w, r.worst);
  }
  return { mean: m/trials, worst: w };
}

console.log('How many markers are visible? (0.5 px corner noise, guitar leaned 10°)');
const lean10 = mm(R0, rx(deg(10)));
for (const c of [3,2,1]) {
  const r = runMarkerCase(c, 0.5, lean10, T0);
  console.log(`  ${c} marker(s) visible -> mean ${r.mean.toFixed(2)}, worst ${r.worst.toFixed(2)} fret-widths`);
}

console.log('\nUnmodelled lens distortion (wide-angle webcam), 3 markers, no noise:');
for (const k of [0, -0.1, -0.25, -0.4]) {
  K1 = k;
  const r = runMarkerCase(3, 0, lean10, T0, 1);
  const r0 = runMarkerCase(3, 0, R0, T0, 1);
  console.log(`  k1=${k.toFixed(2).padStart(5)} -> at calibration pose ${r0.mean.toFixed(2)}, after 10° lean ${r.mean.toFixed(2)} fret-widths`);
}
K1 = 0;

console.log('\nLatency: overlay drawn on the newest frame, H solved from a 66 ms-old frame.');
console.log('(detection at 15 Hz, no prediction or interpolation)');
for (const [name, speed] of [['slow drift, 5°/s', 5], ['repositioning, 30°/s', 30], ['reaching up the neck, 60°/s', 60]]) {
  const dt = 0.066;
  const R = mm(R0, rx(deg(speed*dt)));  // pose when the frame is displayed
  // H was solved from the pose 66 ms ago (= R0) but is applied to the new frame
  const H0 = solveH(calibUV, calibUV.map(([u,v]) => project(world(R0,T0,fbLocal(u,v)))));
  console.log(`  ${name.padEnd(28)} -> ${evalH(H0, R, T0).mean.toFixed(2)} fret-widths of lag error`);
}

// =====================================================================
console.log('\n\n=== B. WHAT A MARKERLESS KEYPOINT DETECTOR WOULD BUY ===\n');
console.log('Keypoints = fret-line endpoints on the board itself (both edges, frets 0..12).');
console.log('These are ON the fretboard plane, so a homography is the CORRECT model,');
console.log('and dots are interpolated between keypoints instead of extrapolated.\n');

function keypointFit(sigma, visibleFrets, R, T, trials = 40) {
  const src = [], truth = [];
  for (const f of visibleFrets) for (const v of [0,1]) {
    src.push([fretU(f), v]); truth.push(project(world(R,T,fbLocal(fretU(f), v))));
  }
  if (src.length < 4) return null;
  let m = 0, w = 0;
  for (let t = 0; t < trials; t++) {
    reseed(500 + t*131);
    const obs = truth.map((q) => ({ x: q.x + sigma*gauss(), y: q.y + sigma*gauss() }));
    const r = evalH(solveH(src, obs), R, T);
    m += r.mean; w = Math.max(w, r.worst);
  }
  return { mean: m/trials, worst: w };
}

const allFrets = [...Array(13).keys()];
console.log('Detector precision vs dot accuracy (all frets 0-12 visible):');
console.log('  sigma      mean      worst');
for (const s of [0.5, 1, 2, 3, 5, 8]) {
  const r = keypointFit(s, allFrets, R0, T0);
  console.log(`  ${String(s).padStart(4)} px   ${r.mean.toFixed(2)}      ${r.worst.toFixed(2)}`);
}

console.log('\nUnder occlusion (fretting hand hides a block of frets), sigma = 2 px:');
const occl = [
  ['hand over frets 3-7  (frets 0-2,8-12 seen)', allFrets.filter(f=>f<3||f>7)],
  ['hand over frets 1-5  (frets 0,6-12 seen)',   allFrets.filter(f=>f<1||f>5)],
  ['only frets 7-12 visible (nut off-frame)',    allFrets.filter(f=>f>=7)],
  ['only frets 9-12 visible (worst case)',       allFrets.filter(f=>f>=9)],
];
for (const [name, fs] of occl) {
  const r = keypointFit(2, fs, R0, T0);
  console.log(`  ${name.padEnd(44)} -> mean ${r.mean.toFixed(2)}, worst ${r.worst.toFixed(2)}`);
}

console.log('\nTemporal averaging over N frames (sigma = 3 px, static guitar, all frets):');
for (const N of [1, 3, 5, 10]) {
  const r = keypointFit(3/Math.sqrt(N), allFrets, R0, T0);
  console.log(`  N=${String(N).padStart(2)} frames (effective sigma ${(3/Math.sqrt(N)).toFixed(1)} px) -> mean ${r.mean.toFixed(2)} fret-widths`);
}

console.log('\nResolution matters — same 2 px detector error at higher capture resolution:');
for (const [name, f, w] of [['640x480', 500, 19.2], ['1280x720', 1000, 38.4], ['1920x1080', 1500, 57.6]]) {
  const savedF = F;
  // scale focal length: error in fret-widths shrinks proportionally
  const r = keypointFit(2 * (500/f) * (f/500), allFrets, R0, T0); // sigma fixed in px
  console.log(`  ${name.padEnd(10)} fret-5 space ~${w.toFixed(0)} px wide -> 2 px error = ${(2/(w/4)*0.25).toFixed(2)} fret-widths`);
}
