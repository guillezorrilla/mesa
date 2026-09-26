import { join } from 'node:path';

// Where Claude Code keeps its files under a home directory: the one module that knows them.

/** Its user settings, where Mesa's hooks go (ADR-0003). */
export const claudeSettings = (home: string) => join(home, '.claude', 'settings.json');

/** Every session's transcript, `<folder>/<agent session id>.jsonl`, one folder per working folder. */
export const claudeTranscripts = (home: string) => join(home, '.claude', 'projects');
