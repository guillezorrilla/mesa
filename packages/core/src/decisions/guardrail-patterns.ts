// What the guardrail blocks on: secrets by the shape their issuer gives them, and commands that
// destroy work or a machine. Each pattern is kept specific, since a false block on an ordinary
// prompt costs more than a miss. The profile's own key values are checked apart (guardrail.ts,
// through redactText), so a secret with no known shape is still caught when it is configured.

/** A pattern the guardrail blocks on: what its reason calls it, and what it matches. */
export type Pattern = { name: string; matches: RegExp };

export const SECRET_PATTERNS: readonly Pattern[] = [
  { name: 'an Anthropic API key', matches: /\bsk-ant-[\w-]{20,}/ },
  { name: 'an OpenAI API key', matches: /\bsk-(?:proj-|svcacct-|admin-)?[\w-]{40,}/ },
  { name: 'a GitHub token', matches: /\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_\w{22,})/ },
  { name: 'an AWS access key id', matches: /\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/ },
  { name: 'a Slack token', matches: /\bxox[abprs]-[A-Za-z0-9-]{10,}/ },
  { name: 'a Stripe secret key', matches: /\b[rs]k_live_[A-Za-z0-9]{20,}/ },
  { name: 'a Google API key', matches: /\bAIza[\w-]{35}(?![\w-])/ },
  { name: 'a private key', matches: /-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY-----/ },
];

/** Commands a person would want to see before they run: each loses work or harms the machine. */
export const DESTRUCTIVE_PATTERNS: readonly Pattern[] = [
  // Both -r and -f in one word, in any order and case (-rf, -fr, -Rf, -rfv).
  { name: 'rm -rf', matches: /\brm\s+-[a-z]*(?:r[a-z]*f|f[a-z]*r)/i },
  // --force-with-lease checks the remote first, so it is left alone.
  { name: 'git push --force', matches: /\bgit\s+push\b[^\n;&|]*\s(?:--force(?![\w-])|-f\b)/ },
  { name: 'git reset --hard', matches: /\bgit\s+reset\b[^\n;&|]*\s--hard\b/ },
  { name: 'git clean -f', matches: /\bgit\s+clean\b[^\n;&|]*\s-[a-z]*f/ },
  { name: 'DROP TABLE', matches: /\bdrop\s+(?:table|database|schema)\b/i },
  { name: 'TRUNCATE TABLE', matches: /\btruncate\s+table\b/i },
  { name: 'mkfs', matches: /\bmkfs(?:\.\w+)?\s[^\n;&|]*\/dev\// },
  { name: 'dd of=/dev/', matches: /\bdd\b[^\n;&|]*\bof=\/dev\// },
  { name: 'chmod -R 777 /', matches: /\bchmod\s+-R\s+0?777\s+\/(?:\s|$)/ },
  { name: 'curl | sh', matches: /\b(?:curl|wget)\b[^\n|]*\|\s*(?:sudo\s+)?(?:ba|z|da|k)?sh\b/ },
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
