/**
 * Simulate the CURRENT FretGuide tracking model to quantify its error.
 *
 * Model: ArUco markers taped to the guitar BODY (a plane offset from the
 * fretboard plane), registered into fretboard-space at calibration via H0^-1,
 * then a single homography re-solved per frame from those anchors and used to
 * project finger dots on the fretboard.
 *
 * Question: how far off (in pixels and in fret-widths) do the dots land after
 * the guitar drifts/rotates a realistic amount?
 */
import { Matrix, solve, inverse } from 'ml-matrix';

// ---------- camera ----------
const F = 500; // focal length px (typical 640x480 webcam)
const CX = 320, CY = 240;
const project = (p) => ({ x: CX + (F * p[0]) / p[2], y: CY + (F * p[1]) / p[2] });

// ---------- guitar geometry (metres) ----------
const L = 0.648; // scale length
const NECK_W = 0.045; // string spread across the board
const BODY_OFFSET = 0.018; // fretboard surface sits this far above the body top face

const fretU = (n) => 1 - Math.pow(2, -n / 12);

// fretboard-space (u,v) -> 3D local. u along neck (fraction of scale length),
// v across strings 0..1. Plane z_local = 0.
const fbLocal = (u, v) => [u * L, (v - 0.5) * NECK_W, 0];
// a point on the BODY plane: metres along/across, offset off the fretboard plane
const bodyLocal = (u, y) => [u * L, y, -BODY_OFFSET];

// ---------- poses ----------
const rx = (a) => [[1,0,0],[0,Math.cos(a),-Math.sin(a)],[0,Math.sin(a),Math.cos(a)]];
const ry = (a) => [[Math.cos(a),0,Math.sin(a)],[0,1,0],[-Math.sin(a),0,Math.cos(a)]];
const rz = (a) => [[Math.cos(a),-Math.sin(a),0],[Math.sin(a),Math.cos(a),0],[0,0,1]];
const mm = (A,B) => A.map((r,i)=>B[0].map((_,j)=>r.reduce((s,_,k)=>s+A[i][k]*B[k][j],0)));
const mv = (A,v) => A.map((r)=>r[0]*v[0]+r[1]*v[1]+r[2]*v[2]);
const add = (a,b) => [a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const deg = (d) => (d * Math.PI) / 180;

// base pose: neck running across the frame, angled away from the camera
const R0 = mm(mm(rz(deg(-18)), ry(deg(28))), rx(deg(6)));
const T0 = [-0.16, 0.02, 0.72];
const world = (R, T, local) => add(mv(R, local), T);

// ---------- homography helpers (same 8-unknown form the app uses) ----------
function solveH(src, dst) {
  const a = [], b = [];
  for (let i = 0; i < src.length; i++) {
    const [u, v] = src[i], { x, y } = dst[i];
    a.push([u, v, 1, 0, 0, 0, -u * x, -v * x]); b.push(x);
    a.push([0, 0, 0, u, v, 1, -u * y, -v * y]); b.push(y);
  }
  const h = solve(new Matrix(a), Matrix.columnVector(b)).to1DArray();
  return [[h[0],h[1],h[2]],[h[3],h[4],h[5]],[h[6],h[7],1]];
}
function applyH(H, u, v) {
  const w = H[2][0]*u + H[2][1]*v + H[2][2];
  return { x: (H[0][0]*u+H[0][1]*v+H[0][2])/w, y: (H[1][0]*u+H[1][1]*v+H[1][2])/w };
}
function invH(H) { return inverse(new Matrix(H)).to2DArray(); }
function imageToFb(H, p) {
  const Hi = invH(H);
  const w = Hi[2][0]*p.x + Hi[2][1]*p.y + Hi[2][2];
  return [(Hi[0][0]*p.x+Hi[0][1]*p.y+Hi[0][2])/w, (Hi[1][0]*p.x+Hi[1][1]*p.y+Hi[1][2])/w];
}

// ---------- markers on the body ----------
const MK = 0.04; // 40 mm marker
// three markers on the body top face, past the neck joint
const markerCentres = [[0.72, -0.06], [0.72, 0.06], [0.86, 0.0]];
const markerCorners3D = markerCentres.flatMap(([u, y]) => [
  bodyLocal(u - MK / 2 / L, y - MK / 2), bodyLocal(u + MK / 2 / L, y - MK / 2),
  bodyLocal(u + MK / 2 / L, y + MK / 2), bodyLocal(u - MK / 2 / L, y + MK / 2),
]);

// ---------- the app's pipeline ----------
// 1. calibration at pose 0: 4 taps on the fretboard -> exact H0 (fretboard IS planar)
const calibUV = [[fretU(0),0],[fretU(0),1],[fretU(12),1],[fretU(12),0]];
const H0 = solveH(calibUV, calibUV.map(([u,v]) => project(world(R0,T0,fbLocal(u,v)))));

// 2. register marker corners into fretboard-space through H0^-1 (off-plane => biased)
const anchors = markerCorners3D.map((p) => imageToFb(H0, project(world(R0,T0,p))));

// sanity: at pose 0 the pipeline is exact by construction
function dotError(R, T, jitterPx = 0, seed = 1) {
  // observed marker corners at the new pose (+ optional detector noise)
  let s = seed;
  const rnd = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return (s / 0x7fffffff) * 2 - 1; };
  const obs = markerCorners3D.map((p) => {
    const q = project(world(R, T, p));
    return { x: q.x + jitterPx * rnd(), y: q.y + jitterPx * rnd() };
  });
  const H1 = solveH(anchors, obs);

  // compare projected dots vs ground truth, frets 1..12, all 6 strings
  let worst = 0, sum = 0, n = 0;
  for (let f = 1; f <= 12; f++) {
    const u = (fretU(f - 1) + fretU(f)) / 2;
    for (let sN = 0; sN < 6; sN++) {
      const v = sN / 5;
      const got = applyH(H1, u, v);
      const want = project(world(R, T, fbLocal(u, v)));
      const e = Math.hypot(got.x - want.x, got.y - want.y);
      // local fret width in px, to express the error in fret-widths
      const a = project(world(R, T, fbLocal(fretU(f - 1), v)));
      const b = project(world(R, T, fbLocal(fretU(f), v)));
      const fw = Math.hypot(a.x - b.x, a.y - b.y);
      worst = Math.max(worst, e / fw); sum += e / fw; n++;
    }
  }
  return { meanFrets: sum / n, worstFrets: worst };
}

const cases = [
  ['no drift (baseline)', R0, T0],
  ['guitar leans 5° (roll about neck axis)', mm(R0, rx(deg(5))), T0],
  ['guitar leans 10°', mm(R0, rx(deg(10))), T0],
  ['guitar leans 20°', mm(R0, rx(deg(20))), T0],
  ['neck swings 10° toward camera (yaw)', mm(R0, ry(deg(10))), T0],
  ['neck tilts 10° in-plane (pitch)', mm(R0, rz(deg(10))), T0],
  ['slides 30 mm along neck axis', R0, add(T0, mv(R0, [0.03, 0, 0]))],
  ['moves 50 mm closer to camera', R0, [T0[0], T0[1], T0[2] - 0.05]],
  ['lean 10° + 30 mm slide', mm(R0, rx(deg(10))), add(T0, mv(R0, [0.03, 0, 0]))],
];

console.log('Fret-width error of the current model (markers on body, single homography)');
console.log('target: mean < 0.25 fret-widths (the PRD success criterion)\n');
console.log('scenario'.padEnd(42), 'mean', ' worst');
for (const [name, R, T] of cases) {
  const r = dotError(R, T);
  console.log(name.padEnd(42), r.meanFrets.toFixed(2).padStart(4), r.worstFrets.toFixed(2).padStart(6));
}

console.log('\nEffect of detector corner noise alone (no drift, markers on body):');
for (const j of [0, 0.25, 0.5, 1, 2]) {
  const rs = [1,2,3,4,5,6,7,8].map((sd) => dotError(R0, T0, j, sd));
  const mean = rs.reduce((a, r) => a + r.meanFrets, 0) / rs.length;
  const worst = Math.max(...rs.map((r) => r.worstFrets));
  console.log(`  +/-${j}px corner jitter -> mean ${mean.toFixed(2)} frets, worst ${worst.toFixed(2)} frets`);
}

// how big is a fret space in pixels here? (accuracy budget)
const a5 = project(world(R0,T0,fbLocal(fretU(4),0.5)));
const b5 = project(world(R0,T0,fbLocal(fretU(5),0.5)));
console.log(`\nScale: fret-5 space is ${Math.hypot(a5.x-b5.x,a5.y-b5.y).toFixed(1)} px wide at 640x480, 0.72 m.`);
console.log(`=> the +/-0.25-fret spec is a +/-${(Math.hypot(a5.x-b5.x,a5.y-b5.y)/4).toFixed(1)} px budget.`);
