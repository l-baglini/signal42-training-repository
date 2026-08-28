/**
 * Append-only JSONL trail: one line per classified title.
 *
 * Its job is to make attempted prompt injections visible after the fact -
 * what the title was, what the guard flagged, what the model said, whether the
 * output validated, and which fighter ended up taking the punch.
 */
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const auditDir = join(dirname(fileURLToPath(import.meta.url)), '../../../audit');
const auditFile = join(auditDir, 'fights.jsonl');

export interface AuditEntry {
  ts: string;
  fightId: string;
  range: string;
  subreddit: string;
  rawTitle: string;
  cleanTitle: string;
  sanitizerAltered: boolean;
  flagged: boolean;
  flagReasons: string[];
  sentiment: string;
  source: 'model' | 'fallback';
  degradedReason?: string;
  outcome: string;
}

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await mkdir(auditDir, { recursive: true });
    await appendFile(auditFile, JSON.stringify(entry) + '\n', 'utf8');
  } catch {
    // Auditing must never take the fight down.
  }
}
