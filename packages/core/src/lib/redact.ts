// Redaction: what Mesa writes or sends never holds a key value, a secret-named field, or the home
// directory. The one owner of those rules.

/** What a redacted value becomes. */
export const REDACTED = '***';

/** Keys whose values are secrets wherever they appear in a payload. */
const SECRET_KEY = /token|key|secret|password/i;

/** `text` with every secret of 4 characters or more replaced by `***`. */
export const redactText = (text: string, secrets: readonly string[]) =>
  secrets.filter((s) => s.length >= 4).reduce((t, secret) => t.split(secret).join(REDACTED), text);

// ponytail: 200 characters of any one string (a prompt, a tool's output); the log is for state,
// not for content, and grows by one line per hook.
const MAX_STRING = 200;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Values under a key naming a secret become `***`, as do configured key values; the home
 * directory becomes `~` (also in the escaped form Claude uses in project folder names); strings
 * longer than `maxString` are cut. The one redactor for hook logs and for what Faro's adapter
 * sends.
 */
export function redactPayload(
  value: unknown,
  home: string,
  secrets: readonly string[] = [],
  maxString = MAX_STRING,
): unknown {
  const homes = home
    ? new RegExp(`${literal(home)}(?=/|$)|${literal(home.replaceAll('/', '-'))}(?=-|$)`, 'g')
    : undefined;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const text = redactText(homes ? v.replace(homes, '~') : v, secrets);
      return text.length > maxString ? `${text.slice(0, maxString)}...` : text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? REDACTED : walk(x)]),
      );
    }
    return v;
  };
  return walk(value);
}
