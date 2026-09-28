import type { SessionState } from '../../sessions/states.js';

/** Only the observed Antigravity 1.2.12 TUI markers. Unknown screens keep the prior state. */
export function antigravityScreenState(tail: string): SessionState | undefined {
  const lower = tail.toLowerCase();
  if (lower.includes('do you trust the contents of this project?')) return 'waiting-question';
  if (lower.includes('generating..')) return 'working';
  if (lower.includes('? for shortcuts')) return 'idle';
  return undefined;
}

export function antigravityLastOutputLine(tail: string): string | undefined {
  const line = tail
    .split('\n')
    .map((part) => part.trim())
    .filter(
      (part) =>
        part && part !== '>' && !part.startsWith('──') && !part.startsWith('? for shortcuts'),
    )
    .at(-1);
  return line ? Array.from(line).slice(0, 200).join('') : undefined;
}
