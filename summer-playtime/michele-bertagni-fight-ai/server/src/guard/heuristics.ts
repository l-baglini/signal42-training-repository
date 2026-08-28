/**
 * Prompt-injection *detection*. Flagging only - never blocking.
 *
 * Blocklists do not stop prompt injection: an attacker rephrases and walks past
 * them, and every pattern here has innocent uses (r/singularity is full of posts
 * legitimately discussing jailbreaks). What this buys us is an audit signal and
 * an "injection attempt" badge in the UI, which is honest and, frankly, one of
 * the more entertaining parts of the app.
 *
 * A flagged title is still classified normally. It just cannot do anything,
 * because of docs/SECURITY.md section 1.
 */

const FULLWIDTH_LT = String.fromCodePoint(0xff1c);

const PATTERNS: ReadonlyArray<readonly [flag: string, re: RegExp]> = [
  ['override',     /\b(ignore|disregard|forget|override)\b[^.]{0,30}\b(previous|prior|above|earlier|all)\b[^.]{0,20}\b(instruction|prompt|rule|direction)/i],
  ['role-hijack',  /\b(you are now|from now on,? you|new (system )?prompt|act as|pretend to be)\b/i],
  ['role-marker',  /(^|\s)(system|assistant|user|human)\s*:/i],
  ['tag-forgery',  new RegExp(`[<${FULLWIDTH_LT}]\\s*/?\\s*(system|instructions?|untrusted_data|prompt)\\b`, 'i')],
  ['exfiltration', /\b(print|reveal|output|show|repeat|dump)\b[^.]{0,30}\b(system prompt|your instructions|api[_ ]?key|token|password|\/etc\/)/i],
  ['tool-request', /\b(curl|wget|bash|sh -c|rm -rf|eval\(|subprocess|os\.system)/i],
  ['answer-rig',   /\b(mark|set|classify|label|rate)\b[^.]{0,40}\b(all|every|each)\b[^.]{0,20}\b(positive|negative|neutral)\b/i],
  ['jailbreak',    /\b(DAN mode|developer mode|jailbreak|do anything now)\b/i],
];

export interface InjectionFlags {
  flagged: boolean;
  reasons: string[];
}

export function detectInjection(clean: string): InjectionFlags {
  const reasons = PATTERNS.filter(([, re]) => re.test(clean)).map(([flag]) => flag);
  return { flagged: reasons.length > 0, reasons };
}
