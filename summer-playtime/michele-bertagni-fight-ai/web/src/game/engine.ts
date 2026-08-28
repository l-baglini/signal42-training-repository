/**
 * Render loop + arena. Consumes fight events and turns them into animation.
 * Pacing comes from the server, so this file never has to guess when the next
 * exchange arrives.
 */
import { Fighter } from './fighter.js';
import type { FightEvent } from '../api.js';

const GROUND_Y = 430;

export class Arena {
  private ctx: CanvasRenderingContext2D;
  private human = new Fighter({ name: 'HUMAN', x: 300, facing: 1, color: '#2f5d8a', accent: '#e8c39e' });
  private ai = new Fighter({ name: 'AI', x: 660, facing: -1, color: '#7a2f6e', accent: '#54e6c8' });
  private shakeUntil = 0;
  private banner: { text: string; until: number } | null = null;
  private running = false;

  /**
   * Warm-up.
   *
   * Reading the feeds and getting the first verdicts back out of Claude takes
   * the better part of twenty seconds, and two idle sprites for twenty seconds
   * reads as a broken page. So the fighters spar while they wait: real stances,
   * real footwork, blocked blows, and deliberately no damage - the health bars
   * stay full and the HUD says WARM-UP, because faking the scoreboard of a game
   * whose entire point is that the scoreboard is real would be a poor joke.
   *
   * It ends the instant the first genuine exchange arrives.
   */
  private warmup: { nextMoveAt: number; attacker: 0 | 1 } | null = null;

  constructor(canvas: HTMLCanvasElement) {
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas 2d context unavailable');
    this.ctx = ctx;
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    const frame = (now: number): void => {
      if (!this.running) return;
      this.stepWarmup(now);
      this.human.update(now);
      this.ai.update(now);
      this.draw(now);
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  }

  stop(): void { this.running = false; }

  startWarmup(): void {
    this.warmup = { nextMoveAt: performance.now() + 600, attacker: 0 };
    this.showBanner('WARM-UP', 1600);
  }

  /** Called when real data lands: clears the spar and opens the actual fight. */
  endWarmup(announce = true): void {
    if (!this.warmup) return;
    this.warmup = null;
    this.human.setStance('idle');
    this.ai.setStance('idle');
    if (announce) this.showBanner('FIGHT!', 1400);
  }

  get isWarmingUp(): boolean { return this.warmup !== null; }

  /** One sparring beat: somebody throws, the other blocks, nobody is hurt. */
  private stepWarmup(now: number): void {
    const w = this.warmup;
    if (!w || now < w.nextMoveAt) return;

    const attacker = w.attacker === 0 ? this.human : this.ai;
    const defender = w.attacker === 0 ? this.ai : this.human;

    // Every so often they just circle instead of throwing anything.
    if (Math.random() < 0.25) {
      attacker.setStance('idle');
      defender.setStance('idle');
    } else {
      attacker.setStance(Math.random() < 0.5 ? 'punch' : 'kick');
      defender.setStance('block');
    }

    w.attacker = w.attacker === 0 ? 1 : 0;
    w.nextMoveAt = now + 620 + Math.random() * 520;
  }

  showBanner(text: string, ms = 1400): void {
    this.banner = { text, until: performance.now() + ms };
  }

  apply(event: FightEvent): void {
    this.endWarmup();
    const now = performance.now();
    if (event.t === 'clinch') {
      this.human.setStance('block');
      this.ai.setStance('block');
      return;
    }
    if (event.t === 'hit') {
      const attacker = event.attacker === 'HUMAN' ? this.human : this.ai;
      const defender = event.attacker === 'HUMAN' ? this.ai : this.human;
      attacker.setStance(event.move);
      window.setTimeout(() => defender.setStance('hit'), 140);
      this.shakeUntil = now + 260;
      return;
    }
    // knockout
    const loser = event.loser === 'HUMAN' ? this.human : this.ai;
    const winner = event.loser === 'HUMAN' ? this.ai : this.human;
    loser.setStance('ko');
    winner.setStance('idle');
    this.showBanner(`${event.winner} WINS`, 6000);
  }

  private draw(now: number): void {
    const { ctx } = this;
    ctx.save();

    if (now < this.shakeUntil) {
      const intensity = (this.shakeUntil - now) / 260;
      ctx.translate((Math.random() - 0.5) * 14 * intensity, (Math.random() - 0.5) * 10 * intensity);
    }

    // backdrop
    const sky = ctx.createLinearGradient(0, 0, 0, 540);
    sky.addColorStop(0, '#0b1020');
    sky.addColorStop(1, '#1d2340');
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, 1000, 580);

    ctx.fillStyle = '#0a0d18';
    ctx.fillRect(-20, GROUND_Y, 1000, 160);
    ctx.strokeStyle = 'rgba(84,230,200,0.18)';
    ctx.lineWidth = 2;
    for (let i = 0; i < 12; i++) {
      ctx.beginPath();
      ctx.moveTo(-20, GROUND_Y + i * 12);
      ctx.lineTo(980, GROUND_Y + i * 12);
      ctx.stroke();
    }

    // During the warm-up they circle each other; in the fight proper they hold
    // their ground and let the sentiment do the moving.
    const sway = this.warmup ? Math.sin(now / 900) * 22 : 0;
    this.human.draw(ctx, now, GROUND_Y, sway);
    this.ai.draw(ctx, now, GROUND_Y, -sway);

    if (this.banner && now < this.banner.until) {
      ctx.font = 'bold 64px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.lineWidth = 8;
      ctx.strokeStyle = '#05070d';
      ctx.strokeText(this.banner.text, 480, 160);
      ctx.fillStyle = '#ffd166';
      ctx.fillText(this.banner.text, 480, 160);
    }

    ctx.restore();
  }
}
