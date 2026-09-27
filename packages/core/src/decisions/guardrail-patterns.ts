// What the guardrail blocks on: secrets by the shape their issuer gives them, and commands that
// destroy work or a machine. Each pattern is kept specific, since a false block on an ordinary
// prompt costs more than a miss. The profile's own key values are checked apart (guardrail.ts,
// through redactText), so a secret with no known shape is still caught when it is configured.

/** A pattern the guardrail blocks on: what its reason calls it, and what it matches. */
export type Pattern = { name: string; matches: RegExp };

export const SECRET_PATTERNS: readonly Pattern[] = [
  { name: 'an Anthropic API key', matches: /\bsk-ant-[\w-]{20,}/ },
  // A project key, which has a digit (a long sk- slug seldom does), or a legacy one, all letters and digits.
  {
    name: 'an OpenAI API key',
    matches: /\bsk-(?:(?:proj|svcacct|admin)-(?=[\w-]*\d)[\w-]{40,}|[A-Za-z0-9]{40,}\b)/,
  },
  { name: 'a GitHub token', matches: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})/ },
  { name: 'an AWS access key id', matches: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'a Slack token', matches: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'a Stripe secret key', matches: /\b[rs]k_live_[A-Za-z0-9]{20,}/ },
  { name: 'a Google API key', matches: /\bAIza[\w-]{35}(?![\w-])/ },
  {
    name: 'a private key',
    // An incomplete paste is still secret: mask through its matching end marker, or all the rest.
    matches: /-----BEGIN ((?:[A-Z0-9]+ )*PRIVATE KEY)-----[\s\S]*?(?:-----END \1-----|$)/,
  },
];

/**
 * `name` run with `arg` within its first three words: a command's shape. A word holds no comma,
 * so prose that only mentions a command ("git push, then drop the -f") does not match.
 */
const command = (name: RegExp, arg: RegExp) =>
  new RegExp(`\\b${name.source}(?:\\s+[^\\s;&|,]+){0,3}?\\s+${arg.source}`);

/**
 * Commands a person would want to see before they run, each in a command's shape: each loses
 * work or harms the machine.
 */
export const DESTRUCTIVE_PATTERNS: readonly Pattern[] = [
  // -rf in one word in any order (-fr, -Rf, -rfv) or two (-r -f), on a target that starts with
  // /, ~, $, *, or a dot: `rm -rf node_modules` goes, `rm -rf ~/` does not.
  {
    name: 'rm -rf',
    matches:
      /\brm(?:\s+-[\w-]+)*?\s+(?:-[a-zA-Z]*(?:[rR][a-zA-Z]*f|f[a-zA-Z]*[rR])[a-zA-Z]*|-[rR]\s+-f|-f\s+-[rR])(?:\s+-[\w-]+)*\s+["']?[/~$*.]/,
  },
  // --force-with-lease checks the remote first, so it is left alone.
  { name: 'git push --force', matches: command(/git\s+push/, /(?:--force(?![\w-])|-f\b)/) },
  { name: 'git reset --hard', matches: command(/git\s+reset/, /--hard\b/) },
  { name: 'git clean -f', matches: command(/git\s+clean/, /(?:-[a-zA-Z]*f|--force\b)/) },
  // SQL's own upper case, then a name: `DROP TABLE tides`, not "drop table support". TRUNCATE
  // without TABLE takes a name that ends the statement: `TRUNCATE tides;`.
  { name: 'DROP TABLE', matches: /\bDROP\s+(?:TABLE|DATABASE|SCHEMA)\s+[\w"`[]/ },
  {
    name: 'TRUNCATE',
    matches: /\bTRUNCATE\s+(?:TABLE\s+[\w"`[]|(?!TABLE\b)[\w"`.[\]]+\s*(?:;|$))/m,
  },
  { name: 'mkfs', matches: command(/mkfs(?:\.\w+)?/, /\/dev\//) },
  // Onto a disk: /dev/null and the like are where dd's benchmarks write.
  {
    name: 'dd of=/dev/',
    matches: command(/dd/, /of=\/dev\/(?!(?:null|zero|random|urandom|stdout|stderr|tty)\b|fd\/)/),
  },
  { name: 'chmod -R 777 /', matches: /\bchmod\s+-R\s+0?777\s+\/(?:\s|$)/ },
  {
    name: 'curl | sh',
    matches: /\b(?:curl|wget)(?:\s+[^\s;&|,]+){1,8}?\s*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/,
  },
  { name: 'a fork bomb', matches: /:\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/ },
];

/** The name of the first pattern `text` matches, if any. */
export const firstMatch = (text: string, patterns: readonly Pattern[]) =>
  patterns.find((p) => p.matches.test(text))?.name;

/** `text` with every match of `patterns` replaced by `mask`. */
export const maskMatches = (text: string, patterns: readonly Pattern[], mask: string) =>
  patterns.reduce(
    (t, p) => t.replace(new RegExp(p.matches.source, `${p.matches.flags}g`), mask),
    text,
  );
