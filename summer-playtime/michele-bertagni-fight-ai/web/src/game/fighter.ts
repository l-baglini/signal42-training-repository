/**
 * A fighter is a small state machine driven purely by the incoming event
 * stream - there is no player input anywhere in this game, by design.
 *
 * Drawn as vector shapes so the scaffold runs with zero art assets. Swapping in
 * a sprite sheet later means replacing draw() and nothing else.
 */
export type Stance = 'idle' | 'punch' | 'kick' | 'hit' | 'block' | 'ko';

export interface FighterOptions {
  name: 'HUMAN' | 'AI';
  x: number;
  facing: 1 | -1;
  color: string;
  accent: string;
}

const STANCE_MS: Record<Stance, number> = {
  idle: Infinity, punch: 420, kick: 520, hit: 380, block: 600, ko: Infinity,
};

export class Fighter {
  stance: Stance = 'idle';
  private stanceStart = performance.now();
  private bobPhase = Math.random() * Math.PI * 2;

  constructor(private readonly opts: FighterOptions) {}

  setStance(stance: Stance): void {
    this.stance = stance;
    this.stanceStart = performance.now();
  }

  update(now: number): void {
    if (this.stance === 'idle' || this.stance === 'ko') return;
    if (now - this.stanceStart > STANCE_MS[this.stance]) this.setStance('idle');
  }

  /** 0..1 progress through the current stance animation. */
  private progress(now: number): number {
    const dur = STANCE_MS[this.stance];
    return dur === Infinity ? 0 : Math.min(1, (now - this.stanceStart) / dur);
  }

  /** `offsetX` lets the arena move a fighter without touching its own state. */
  draw(ctx: CanvasRenderingContext2D, now: number, groundY: number, offsetX = 0): void {
    const { x, facing, color, accent } = this.opts;
    const p = this.progress(now);
    const bob = this.stance === 'idle' ? Math.sin(now / 320 + this.bobPhase) * 4 : 0;

    ctx.save();
    ctx.translate(x + offsetX, groundY + bob);
    ctx.scale(facing, 1);

    if (this.stance === 'ko') {
      ctx.rotate((-Math.PI / 2) * 0.9);
      ctx.translate(-40, 30);
    } else if (this.stance === 'hit') {
      ctx.translate(-14 * Math.sin(p * Math.PI), 0);
    }

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(0, 6, 46, 10, 0, 0, Math.PI * 2);
    ctx.fill();

    // legs
    ctx.strokeStyle = color;
    ctx.lineWidth = 14;
    ctx.lineCap = 'round';
    const kickLift = this.stance === 'kick' ? Math.sin(p * Math.PI) : 0;
    ctx.beginPath();
    ctx.moveTo(-8, 0); ctx.lineTo(-22, -60);
    ctx.moveTo(8, 0 - kickLift * 40); ctx.lineTo(22 + kickLift * 70, -60 - kickLift * 10);
    ctx.stroke();

    // torso
    ctx.beginPath();
    ctx.moveTo(0, -60); ctx.lineTo(0, -130);
    ctx.lineWidth = 26;
    ctx.stroke();

    // arms
    const punchReach = this.stance === 'punch' ? Math.sin(p * Math.PI) : 0;
    ctx.lineWidth = 12;
    ctx.beginPath();
    ctx.moveTo(0, -118); ctx.lineTo(-26, -86);
    ctx.moveTo(0, -118); ctx.lineTo(30 + punchReach * 74, -104 - punchReach * 6);
    ctx.stroke();

    // head
    ctx.fillStyle = accent;
    ctx.beginPath();
    ctx.arc(0, -152, 22, 0, Math.PI * 2);
    ctx.fill();

    // the AI gets a visor, the human gets an eye - readable at a glance
    ctx.fillStyle = '#05070d';
    if (this.opts.name === 'AI') ctx.fillRect(-14, -158, 28, 9);
    else { ctx.beginPath(); ctx.arc(9, -155, 3.5, 0, Math.PI * 2); ctx.fill(); }

    ctx.restore();
  }
}
