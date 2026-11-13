/** A rule line of the agent's input box. */
const RULE = /^[─━═]{3,}$/;

// Lines Claude Code and Codex draw around their input box, not what the agent printed: the empty
// prompt, the box's rules, the permission mode and shortcut hints, the clipboard hint, Codex's
// context gauge. ponytail: matched by their current wording; a new release's footer shows until
// a pattern here learns it.
const CHROME = [
  /^[❯›>]$/,
  RULE,
  /\(shift\+tab to cycle\)/,
  /^⏵⏵/,
  /\? for shortcuts/,
  /^Image in clipboard/,
  /^\d+% context left/,
];

const chrome = (line = '') => CHROME.some((pattern) => pattern.test(line.trim()));

/**
 * A session's output without its agent's screen chrome: each chrome line, and the status line
 * Claude Code draws between the box's lower rule and the mode line (the cwd, by default). Each
 * line is read by its plain `text`, so coloured lines keep their colours.
 */
export function withoutChrome<T>(lines: T[], text: (line: T) => string = String): T[] {
  const plain = lines.map(text);
  const statusLine = (at: number) =>
    RULE.test(plain[at - 1]?.trim() ?? '') && chrome(plain[at + 1]);
  return lines.filter((_, at) => !chrome(plain[at]) && !statusLine(at));
}
