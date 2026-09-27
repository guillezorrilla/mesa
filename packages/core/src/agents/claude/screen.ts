// Tail patterns ported from CCManager's Claude Code state detector
// (src/services/stateDetector/claude.ts at 7b55c65, https://github.com/kbwo/ccmanager, MIT,
// Copyright (c) kbwo), as ADR-0005 requires. Ported: the search prompt (idle), the ctrl+r
// toggle (no reading), the "Do you want / Would you like" menu, "esc to cancel", the numbered
// "Deny (esc)" option, and, in the most recent block above the prompt box only, "esc to
// interrupt", "ctrl+c to interrupt", the spinner activity label, and the token stats line.
// Changed here: CCManager's single `waiting_input` splits into a question (the menu's "Enter to
// select", Mesa's marker from docs/spikes/state-signals.md, checked first) and a permission; the
// "Do you want" menu must offer a numbered Yes, so a plain question above the prompt stays idle;
// and there is no idle debounce, since the board reads one snapshot (at 0.6, only when no hook
// or listing speaks).

import type { SessionState } from '../../sessions/states.js';

const SPINNER_CHARS = '✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋✢✣✤✥✦✧✨⊛⊕⊙◉◎◍⁂⁕※⍟☼★☆·•⏺▸▹∙⋅○●';
const SPINNER_ACTIVITY = new RegExp(`^[${SPINNER_CHARS}] \\S+ing.*\u2026`, 'm');
const TOKEN_STATS = /\([^)]*\d[^)]*tokens\s*\)/i;
const RULE = /^[-─\s]*$/;

/**
 * CCManager's getRecentContentAbovePromptBox: the lines above the prompt box (the second ─
 * border from the bottom), trailing blanks, rules, and the bare ❯ dropped, then the last
 * contiguous block of them. Old output further up cannot read as busy.
 */
function recentAbovePrompt(tail: string): string {
  const lines = tail.split('\n');
  const borders = lines.flatMap((l, i) => (/^─+$/.test(l.trim()) ? [i] : []));
  const above = lines.slice(0, borders.length >= 2 ? borders.at(-2) : lines.length);
  while (above.length && (RULE.test(above.at(-1) ?? '') || above.at(-1)?.trim() === '❯')) {
    above.pop();
  }
  let start = above.length;
  while (start > 0 && !RULE.test(above[start - 1] ?? '')) start--;
  return above.slice(start).join('\n');
}

// ponytail: 200 characters, as the hook log keeps; the board shows one line.
/** The board's "last output": the last line of the latest block above the prompt box. */
export function claudeLastOutputLine(tail: string): string | undefined {
  const line = recentAbovePrompt(tail)
    .split('\n')
    .map((l) => l.trim())
    // tmux's own line under a dead pane (remain-on-exit) is not the agent's.
    .filter((l) => l && !/^Pane is dead \(/.test(l))
    .at(-1);
  return line && Array.from(line).slice(0, 200).join('');
}

/** Claude Code's screen read as a state, or none when it shows nothing that says one. */
export function claudeScreenState(tail: string): SessionState | undefined {
  if (!tail.trim()) return undefined;
  const lower = tail.toLowerCase();
  if (lower.includes('⌕ search…')) return 'idle';
  if (lower.includes('ctrl+r to toggle')) return undefined;
  // The question menu: "Enter to select · ↑/↓ to navigate · Esc to cancel".
  if (lower.includes('enter to select')) return 'waiting-question';
  if (/(?:do you want|would you like).+\n+[\s\S]*?\d+\.\s*yes/.test(lower)) {
    return 'waiting-permission';
  }
  if (lower.includes('esc to cancel') || /\d+\.\s*deny\s*\(esc\)/.test(lower)) {
    return 'waiting-permission';
  }
  const recent = recentAbovePrompt(tail);
  const busy = recent.toLowerCase();
  if (busy.includes('esc to interrupt') || busy.includes('ctrl+c to interrupt')) return 'working';
  if (SPINNER_ACTIVITY.test(recent) || TOKEN_STATS.test(recent)) return 'working';
  return 'idle';
}
