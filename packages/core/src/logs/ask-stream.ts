import { existsSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import { streamedText } from '../sessions/run/live.js';

// An Ask's streamed answer (CONTEXT.md, Ask (logs)): its caller makes a token, the Ask names its
// run under that token in runs/ once the run has started, and `mesa logs asking <token>` reads
// that run's answer so far, so two Asks at once never show each other's text.

/** A caller's token for one Ask's streamed answer. */
const STREAM_TOKEN = z
  .string()
  .regex(/^[\w-]{8,64}$/, 'a token of 8 to 64 letters, digits, _ or -');

/** Where the Ask with `token` names its run. */
const tokenFile = (runs: string, token: string) =>
  join(runs, `${parseWith(STREAM_TOKEN, token, '--stream')}.ask`);

/**
 * Claims `token` for one Ask (usage when another Ask holds it): `started` names the run once it
 * starts, `done` lets the token go.
 */
export function claimStream(runs: string, token: string) {
  const file = tokenFile(runs, token);
  if (existsSync(file))
    throw new MesaError('usage', `stream token ${token} is in use by another Ask`);
  return {
    started: (session: string) => writeFileAtomic(file, session, 0o600),
    done: () => rmSync(file, { force: true }),
  };
}

/** What the Ask holding `token` has answered so far; no session before its run starts or after it ends. */
export function streamedAnswer(runs: string, token: string) {
  const file = tokenFile(runs, token);
  const session = existsSync(file) ? readFileSync(file, 'utf8').trim() : '';
  return session ? { session, text: streamedText(runs, session) } : { session: null, text: '' };
}
