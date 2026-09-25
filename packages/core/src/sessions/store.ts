import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentSchema } from '../agents.js';
import { writeFileAtomic } from '../atomic-file.js';
import type { IdSource } from '../ids.js';
import { MesaError } from '../result.js';
import { parseWith } from '../yaml-file.js';
import type { WindowTarget } from './tmux.js';

// Session records: one JSON file per session in the profile's `sessions/`, outliving tmux.

export const SESSION_STATES = [
  'working',
  'waiting-permission',
  'waiting-question',
  'idle',
  'done',
  'failed',
] as const;
export type SessionState = (typeof SESSION_STATES)[number];

const SHORT_ID = /^[0-9a-z]{8}$/;
const RECORD_FILE = /^([0-9a-z]{8})\.json$/;

const SessionRecordSchema = z.strictObject({
  /** Short: typed in `mesa stop <id>`. */
  id: z.string().regex(SHORT_ID),
  kind: z.enum(['interactive', 'run']),
  project: z.string(),
  agent: AgentSchema,
  /** Claude Code's session UUID. */
  agentSessionId: z.string().optional(),
  tmux: z.strictObject({ socket: z.string(), session: z.string(), window: z.string() }),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  lastState: z.strictObject({
    state: z.enum(SESSION_STATES),
    confidence: z.number().min(0).max(1),
    at: z.iso.datetime(),
    /** ADR-0003's signals (hook, listing, tmux), or Mesa's own action (open, stop). */
    source: z.enum(['hook', 'listing', 'tmux', 'mesa']),
  }),
  lastOutput: z.string().optional(),
  // ponytail: the hooks stream events to sessions/events/ (#22); nothing reads this list yet.
  events: z.array(z.unknown()),
  resumedFrom: z.string().optional(),
  resumedBy: z.string().optional(),
});
export type SessionRecord = z.infer<typeof SessionRecordSchema>;
export type NewSession = Omit<SessionRecord, 'id' | 'events'>;

/** States a session does not leave on its own; distinct from ended (stopped, with `endedAt`). */
export const FINAL_STATES: ReadonlySet<SessionState> = new Set(['done', 'failed']);

/**
 * What ending a record at `at` sets: `endedAt` (when it was seen done or failed, if it was), and
 * `done` unless it had already finished; a `failed` stays failed.
 */
export function ending(r: SessionRecord, at: string): Pick<SessionRecord, 'endedAt' | 'lastState'> {
  if (FINAL_STATES.has(r.lastState.state)) {
    return { endedAt: r.endedAt ?? r.lastState.at, lastState: r.lastState };
  }
  return {
    endedAt: r.endedAt ?? at,
    lastState: { state: 'done', confidence: 1, at, source: 'mesa' },
  };
}

/** A session with no live window: nothing to attach to or type into, only to resume. */
export const sessionEnded = () => new MesaError('not_found', 'session ended; use mesa resume');

/** The session's window on the profile's tmux server. */
export const windowOf = (r: SessionRecord): WindowTarget => ({
  project: r.tmux.session,
  window: r.tmux.window,
});

/** The ULID's last 8 characters are random: 40 bits, and short enough to type. */
const shortId = (newId: IdSource) => newId().slice(-8).toLowerCase();

export function sessionStore({ dir, newId }: { dir: string; newId: IdSource }) {
  /** The record's file; an id that is not a short id names no session, and never a path. */
  const fileOf = (id: string) => {
    if (!SHORT_ID.test(id)) throw new MesaError('not_found', `no session ${id}`);
    return join(dir, `${id}.json`);
  };
  const read = (id: string): SessionRecord => {
    const file = fileOf(id);
    const text = readFileSync(file, 'utf8');
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      throw new MesaError('invalid_config', `${file}: not valid JSON`);
    }
    const record = parseWith(SessionRecordSchema, raw, file);
    // update() writes to the record's own id, so a copied file must not hold another's.
    if (record.id !== id) throw new MesaError('invalid_config', `${file}: id is ${record.id}`);
    return record;
  };
  const write = (record: SessionRecord) => {
    const valid = parseWith(SessionRecordSchema, record, fileOf(record.id));
    writeFileAtomic(fileOf(record.id), `${JSON.stringify(valid, null, 2)}\n`);
    return valid;
  };
  const get = (id: string) => {
    if (!existsSync(fileOf(id))) throw new MesaError('not_found', `no session ${id}`);
    return read(id);
  };

  return {
    /** A new record with a fresh id, which `build` may use (the window is named after it). */
    create: (build: (id: string) => NewSession): SessionRecord => {
      const id = shortId(newId);
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      if (existsSync(fileOf(id))) throw new MesaError('internal', `session id ${id} is taken`);
      return write({ ...build(id), id, events: [] });
    },
    get,
    // ponytail: read-modify-write without a lock; add one when hooks (#22) update records too.
    update: (id: string, patch: Partial<Omit<SessionRecord, 'id'>>) =>
      write({ ...get(id), ...patch, id }),
    /** Every record, oldest first. */
    list: (): SessionRecord[] => {
      if (!existsSync(dir)) return [];
      return readdirSync(dir, { withFileTypes: true })
        .flatMap((e) => {
          const id = e.isFile() && RECORD_FILE.exec(e.name)?.[1];
          return id ? [read(id)] : [];
        })
        .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
    },
    remove: (id: string) => {
      get(id);
      rmSync(fileOf(id));
    },
  };
}

export type SessionStore = ReturnType<typeof sessionStore>;
