/**
 * Anything that travels from the server to the browser passes through here.
 *
 * Node error messages happily embed absolute paths, home directories and
 * usernames (ENOENT, spawn failures, stderr snippets). Those are details about
 * the machine, not about the fight, and the browser has no use for them - so
 * they are logged locally and stripped before they leave the process.
 */
import { homedir, hostname, userInfo } from 'node:os';

const identifiers: string[] = [homedir(), hostname(), userInfo().username].filter(
  (s): s is string => typeof s === 'string' && s.length > 2,
);

/**
 * Filesystem paths only - anchored to real root directories.
 *
 * Deliberately not "any run of slash-separated segments": Reddit permalinks are
 * legitimate payload and an over-eager pattern turns
 * https://www.reddit.com/r/singularity/comments/... into https:/<path>, which
 * silently breaks every link in the ticker. Learned the hard way.
 */
const FS_PATH =
  /(?:\/(?:home|Users|root|tmp|var|etc|opt|usr|srv|mnt|private|proc|dev)\/[^\s"',)]*)|(?:[A-Za-z]:\\[^\s"',)]*)/g;

/**
 * Replaces machine-identifying substrings with neutral placeholders.
 *
 * `maxLength` guards free-form text such as subprocess stderr. Pass Infinity for
 * anything that must stay parseable - truncating a JSON frame would corrupt it.
 */
export function redact(message: string, maxLength = 300): string {
  let out = message.replace(FS_PATH, '<path>');
  for (const id of identifiers) out = out.replaceAll(id, '<redacted>');
  return out.slice(0, maxLength);
}
