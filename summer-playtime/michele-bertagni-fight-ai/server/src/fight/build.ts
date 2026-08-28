/**
 * Fight rules. Pure logic, no I/O, no network - easy to test and impossible for
 * a post title to reach, because all it ever receives is one of three enum
 * values (see docs/SECURITY.md section 5).
 *
 *   positive sentiment about using AI -> the AI hits the Human
 *   negative sentiment about using AI -> the Human hits the AI
 *   neutral                           -> a clinch: both block, no damage
 *
 * 10 HP each, 1 damage per hit, first to zero falls to the ground.
 */
import { config } from '../config.js';
import type { Sentiment } from '../guard/validate.js';

export type Fighter = 'HUMAN' | 'AI';
export type Move = 'punch' | 'kick';

export interface Hp { human: number; ai: number }

export interface HitEvent {
  t: 'hit';
  attacker: Fighter;
  move: Move;
  hp: Hp;
  /** The sanitised title that caused this exchange. */
  title: string;
  permalink: string;
  /** Which community the title came from. */
  subreddit: string;
  flagged: boolean;
  flagReasons: string[];
  /** "model" or "fallback" - was Claude's verdict trusted for this one? */
  source: 'model' | 'fallback';
}

export interface ClinchEvent {
  t: 'clinch';
  title: string;
  permalink: string;
  subreddit: string;
  flagged: boolean;
  source: 'model' | 'fallback';
}

export interface KoEvent { t: 'ko'; winner: Fighter; loser: Fighter; hp: Hp }

export type FightEvent = HitEvent | ClinchEvent | KoEvent;

export interface Classified {
  clean: string;
  permalink: string;
  subreddit: string;
  sentiment: Sentiment;
  flagged: boolean;
  flagReasons: string[];
  source: 'model' | 'fallback';
}

/** Alternates punch/kick per fighter so the animation never repeats twice. */
class MoveCycle {
  private next: Record<Fighter, Move> = { HUMAN: 'punch', AI: 'punch' };
  take(f: Fighter): Move {
    const move = this.next[f];
    this.next[f] = move === 'punch' ? 'kick' : 'punch';
    return move;
  }
}

export class FightState {
  private hp: Hp = { human: config.rules.startingHp, ai: config.rules.startingHp };
  private moves = new MoveCycle();
  private over = false;

  get isOver(): boolean { return this.over; }
  get health(): Hp { return { ...this.hp }; }

  /** True when one more hit on `target` would end the fight (used for pacing). */
  wouldEndFight(sentiment: Sentiment): boolean {
    if (sentiment === 'neutral') return false;
    const target = sentiment === 'positive' ? 'human' : 'ai';
    return this.hp[target] - config.rules.damagePerHit <= 0;
  }

  /** Applies one classified title. Returns the event(s) it produced. */
  apply(item: Classified): FightEvent[] {
    if (this.over) return [];

    if (item.sentiment === 'neutral') {
      return [{
        t: 'clinch',
        title: item.clean,
        permalink: item.permalink,
        subreddit: item.subreddit,
        flagged: item.flagged,
        source: item.source,
      }];
    }

    const attacker: Fighter = item.sentiment === 'positive' ? 'AI' : 'HUMAN';
    const targetKey = attacker === 'AI' ? 'human' : 'ai';
    this.hp[targetKey] = Math.max(0, this.hp[targetKey] - config.rules.damagePerHit);

    const events: FightEvent[] = [{
      t: 'hit',
      attacker,
      move: this.moves.take(attacker),
      hp: this.health,
      title: item.clean,
      permalink: item.permalink,
      subreddit: item.subreddit,
      flagged: item.flagged,
      flagReasons: item.flagReasons,
      source: item.source,
    }];

    if (this.hp[targetKey] === 0) {
      this.over = true;
      events.push({
        t: 'ko',
        winner: attacker,
        loser: attacker === 'AI' ? 'HUMAN' : 'AI',
        hp: this.health,
      });
    }

    return events;
  }
}
