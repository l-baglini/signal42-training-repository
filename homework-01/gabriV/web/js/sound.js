// Procedural sound effects via WebAudio — no asset files (SPEC §9.2, keeps the
// "no assets pipeline" non-goal intact). Each effect is a one-shot oscillator with
// a quick gain envelope. The AudioContext is created lazily and resumed on the first
// user gesture (browsers block audio before that); resume() is called from the fire
// click in weapons.js.
export function createSound() {
  let ctx = null;

  function ac() {
    ctx ??= new (window.AudioContext || window.webkitAudioContext)();
    return ctx;
  }

  function resume() {
    if (ctx?.state === 'suspended') ctx.resume();
  }

  // one short tone with an exponential decay; optional pitch slide for a "blip"/"thud"
  function blip({ freq, type = 'square', dur = 0.08, gain = 0.12, slideTo }) {
    const c = ac();
    if (c.state === 'suspended') c.resume();
    const t0 = c.currentTime;
    const osc = c.createOscillator();
    const g = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  return {
    resume,
    fire() { blip({ freq: 240, type: 'square', dur: 0.07, gain: 0.07, slideTo: 90 }); },
    kill() { blip({ freq: 180, type: 'sawtooth', dur: 0.28, gain: 0.16, slideTo: 55 }); },
  };
}
