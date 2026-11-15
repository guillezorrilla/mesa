import { sessionEnded } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import type { TmuxBackend } from '../tmux/backend.js';
import { RULE, withoutChrome } from './screen-chrome.js';
import { plainText } from './terminal-text.js';
import { windowOf } from './window-name.js';

/** How far up the pane a command's echo or panel is looked for. */
const PANEL_LINES = 200;
/** The top edge Claude Code draws over a panel that takes its input box's place (`/model`). */
const PANEL_TOP = /^▔{3,}/;
/** An input box's prompt line (`❯`, Codex's `›`), where a command's printed output ends. */
const PROMPT = /^[❯›>](?:\s|$)/;

/**
 * What slash command `command`, sent to session `id`, shows in its pane now, with its colours:
 * the panel Claude Code draws in its input box's place (`/model`, `/usage`), else the lines it or
 * Codex printed under the command's echo (`/context`, Codex's `/status`) up to the prompt; the
 * agent's screen chrome dropped (withoutChrome). Empty when neither is on screen.
 * ponytail: found by how Claude Code 2.1 and Codex 0.16 draw today; the card falls back to the
 * transcript's output, and Open in terminal, when a release draws them otherwise.
 */
export async function sessionPanel(
  deps: { store: SessionStore; tmux: Pick<TmuxBackend, 'findWindow' | 'capturePane'> },
  id: string,
  command: string,
) {
  const record = deps.store.get(id);
  const target = windowOf(record);
  const pane = await deps.tmux.findWindow(target);
  if (record.endedAt || !pane || pane.dead) throw sessionEnded();
  const text = await deps.tmux.capturePane(target, PANEL_LINES, { colors: true });
  return { session: id, command, lines: panelLines(text.split('\n'), command) };
}

/** The lines of `screen` that show `command`'s panel or output (sessionPanel). */
export function panelLines(screen: string[], command: string): string[] {
  const bare = screen.map((line) => plainText(line).trim());
  const typed = command.trim();
  const echo = bare.map((line) => line.replace(/^[❯›>]\s*/, '') === typed).lastIndexOf(true);
  const top = bare.map((line) => PANEL_TOP.test(line)).lastIndexOf(true);
  if (top < 0 && echo < 0) return [];
  if (top > echo) return withoutChrome(screen.slice(top + 1));
  const end = bare.findIndex((line, at) => at > echo && (RULE.test(line) || PROMPT.test(line)));
  return withoutChrome(screen.slice(echo + 1, end < 0 ? undefined : end));
}
