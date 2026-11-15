import { plainText } from './terminal-text.js';

/** A rule line of the agent's input box. */
export const RULE = /^[─━═]{3,}$/;

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

/** A line's text without its colours, trimmed: a captured pane's lines keep them (`-e`). */
const bare = (line = '') => plainText(line).trim();
const chrome = (line = '') => CHROME.some((pattern) => pattern.test(bare(line)));

/**
 * A session's output without its agent's screen chrome: each chrome line, and the status line
 * Claude Code draws between the box's lower rule and the mode line (the cwd, by default). The
 * phone's terminal and the app's command cards (sessions/window/panel.ts) both read through it.
 */
export function withoutChrome(lines: string[]): string[] {
  const statusLine = (at: number) => RULE.test(bare(lines[at - 1])) && chrome(lines[at + 1]);
  return lines.filter((line, at) => !chrome(line) && !statusLine(at));
}
