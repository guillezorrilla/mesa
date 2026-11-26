import { existsSync, readFileSync } from 'node:fs';
import { readClaudeStream } from '../../agents/claude/result.js';
import { runOutput } from './files.js';

// What a skill run that streams its answer (an Ask's, CONTEXT.md Ask (logs)) has written so far.

/** The text run `id`'s streamed answer holds so far in `runs` (readClaudeStream); empty with none. */
export function streamedText(runs: string, id: string) {
  const file = runOutput(runs, id);
  return existsSync(file) ? readClaudeStream(readFileSync(file, 'utf8')) : '';
}
