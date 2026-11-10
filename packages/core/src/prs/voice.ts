import { join } from 'node:path';
import { MesaError } from '../lib/result.js';
import { readTextFile } from '../lib/text-file.js';

/** The profile's Review voice (CONTEXT.md): its file, and its text or null when there is none. */
export type ReviewVoice = { path: string; text: string | null };

/** How the person writes review comments, kept in the profile at `prs/voice.md`, never in a repo. */
export function reviewVoice(prsDir: string): ReviewVoice {
  const path = join(prsDir, 'voice.md');
  try {
    const text = readTextFile(path, 'review voice').trim();
    return { path, text: text || null };
  } catch (error) {
    if (error instanceof MesaError && error.code === 'not_found') return { path, text: null };
    throw error;
  }
}
