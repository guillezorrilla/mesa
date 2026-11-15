import { shellWord } from '../../lib/process.js';

/** The command a Structured session's window runs (ADR-0029): this mesa's `host` for it. */
export const hostCommand = (self: readonly string[], id: string) =>
  [...self.map(shellWord), 'host', id].join(' ');
