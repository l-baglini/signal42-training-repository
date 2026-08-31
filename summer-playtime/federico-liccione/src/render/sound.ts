/**
 * Four sounds, synthesised. No asset files.
 *
 * Included early in the look-and-feel pass because it is the highest impact per
 * unit of effort in the whole project: a shot that makes a noise reads as a game,
 * and a silent one reads as a demo, whatever the pixels are doing.
 *
 * WebAudio must be started from a gesture, so `unlock` is called on the first
 * click rather than at load. Everything degrades to silence if audio is
 * unavailable — a game that throws because it cannot make a noise is worse than
 * a quiet game.
 */
export interface Sfx {
  shot(): void
  kill(): void
  hurt(): void
  /** A new enemy has taken a position somewhere. */
  arrive(): void
  /** Rising warning tone. `intensity` 0..1 is how charged the fuse is. */
  exposed(intensity: number): void
  unlock(): void
  setEnabled(on: boolean): void
  readonly enabled: boolean
}

export function createSfx(): Sfx {
  let ctx: AudioContext | null = null
  let master: GainNode | null = null
  let enabled = true
  let lastWarnAt = 0

  function ensure(): AudioContext | null {
    if (!enabled) return null
    if (ctx) return ctx
    try {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return null
      ctx = new Ctor()
      master = ctx.createGain()
      master.gain.value = 0.22
      master.connect(ctx.destination)
    } catch {
      ctx = null
    }
    return ctx
  }

  function tone(
    freq: number,
    durS: number,
    type: OscillatorType,
    attack = 0.004,
    endFreq?: number,
    gain = 1,
  ): void {
    const c = ensure()
    if (!c || !master) return
    const t = c.currentTime
    const osc = c.createOscillator()
    const g = c.createGain()
    osc.type = type
    osc.frequency.setValueAtTime(freq, t)
    if (endFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t + durS)
    g.gain.setValueAtTime(0, t)
    g.gain.linearRampToValueAtTime(gain, t + attack)
    g.gain.exponentialRampToValueAtTime(0.0001, t + durS)
    osc.connect(g)
    g.connect(master)
    osc.start(t)
    osc.stop(t + durS + 0.02)
  }

  function noise(durS: number, gain = 0.5, highpass = 400): void {
    const c = ensure()
    if (!c || !master) return
    const t = c.currentTime
    const frames = Math.max(1, Math.floor(c.sampleRate * durS))
    const buf = c.createBuffer(1, frames, c.sampleRate)
    const data = buf.getChannelData(0)
    // A deterministic-enough hiss; the shape matters far more than the spectrum.
    let seed = 12345
    for (let i = 0; i < frames; i++) {
      seed = (seed * 1103515245 + 12345) & 0x7fffffff
      data[i] = ((seed / 0x7fffffff) * 2 - 1) * (1 - i / frames)
    }
    const src = c.createBufferSource()
    src.buffer = buf
    const hp = c.createBiquadFilter()
    hp.type = 'highpass'
    hp.frequency.value = highpass
    const g = c.createGain()
    g.gain.value = gain
    src.connect(hp)
    hp.connect(g)
    g.connect(master)
    src.start(t)
  }

  return {
    get enabled() { return enabled },
    setEnabled(on: boolean) {
      enabled = on
      if (master) master.gain.value = on ? 0.22 : 0
    },
    unlock() {
      const c = ensure()
      if (c && c.state === 'suspended') void c.resume()
    },
    shot() {
      noise(0.06, 0.5, 900)
      tone(220, 0.07, 'square', 0.002, 90, 0.5)
    },
    kill() {
      tone(660, 0.09, 'triangle', 0.003, 990, 0.6)
      tone(990, 0.16, 'sine', 0.01, 1320, 0.35)
    },
    hurt() {
      noise(0.22, 0.55, 200)
      tone(150, 0.28, 'sawtooth', 0.004, 60, 0.55)
    },
    /**
     * Someone new has taken a position. Low, short, and behind you in the mix —
     * it is not a threat yet, it is the room telling you it changed. Without it a
     * replacement arriving is completely silent and completely invisible, since a
     * covered enemy draws nothing.
     */
    arrive() {
      tone(150, 0.10, 'sine', 0.008, 105, 0.30)
      noise(0.05, 0.35, 320)
    },
    exposed(intensity: number) {
      const c = ensure()
      if (!c) return
      // Throttled, and it speeds up as the fuse fills: the sound carries the
      // same information the bar does, for the half of the time you are looking
      // at the room rather than at the HUD.
      const gap = 0.42 - 0.3 * Math.max(0, Math.min(1, intensity))
      if (c.currentTime - lastWarnAt < gap) return
      lastWarnAt = c.currentTime
      tone(300 + 500 * intensity, 0.07, 'sine', 0.005, undefined, 0.28)
    },
  }
}
