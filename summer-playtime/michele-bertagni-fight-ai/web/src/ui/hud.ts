import type { Hp } from '../api.js';

const el = (id: string): HTMLElement => {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing element #${id}`);
  return node;
};

/**
 * Health bars drain smoothly, with a slower "ghost" bar trailing behind so the
 * viewer can see how much damage a single hit did.
 */
export class Hud {
  private bars = {
    human: el('hp-human'),
    ai: el('hp-ai'),
    ghostHuman: el('ghost-human'),
    ghostAi: el('ghost-ai'),
  };

  constructor(private readonly maxHp = 10) { this.set({ human: maxHp, ai: maxHp }); }

  set(hp: Hp): void {
    const pct = (v: number): string => `${Math.max(0, Math.min(100, (v / this.maxHp) * 100))}%`;
    this.bars.human.style.width = pct(hp.human);
    this.bars.ai.style.width = pct(hp.ai);
    // Ghost bars use a CSS transition-delay, so they catch up a beat later.
    window.setTimeout(() => {
      this.bars.ghostHuman.style.width = pct(hp.human);
      this.bars.ghostAi.style.width = pct(hp.ai);
    }, 300);
  }
}
