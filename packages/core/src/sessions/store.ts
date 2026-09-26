import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { z } from 'zod';
import { AgentSchema } from '../agents/agents.js';
import { writeFileAtomic } from '../lib/atomic-file.js';
import type { IdSource } from '../lib/ids.js';
import { withLockSync } from '../lib/lock-file.js';
import type { Env } from '../lib/process.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
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
/** An 8-character Mesa session id, so one from outside (a hook's env) never becomes a path. */
export const isSessionId = (id: string) => SHORT_ID.test(id);
const RECORD_FILE = /^([0-9a-z]{8})\.json$/;

const FOREIGN = 'ext-';
/** A foreign session's board id (CONTEXT.md): no record has it, so every lookup refuses it. */
export const foreignId = (pid: number) => `${FOREIGN}${pid}` as const;

const SessionRecordSchema = z.strictObject({
  /** Short: typed in `mesa stop <id>`. */
  id: z.string().regex(SHORT_ID),
  kind: z.enum(['interactive', 'run']),
  project: z.string(),
  agent: AgentSchema,
  /** Claude Code's session UUID. */
  agentSessionId: z.string().optional(),
  /** The first prompt the agent was started with (CONTEXT.md, Goal). */
  goal: z.string().optional(),
  /** The session this one was started from (CONTEXT.md, Parent session). */
  parent: z.string().regex(SHORT_ID).optional(),
  /** What a person calls it (mesa adopt --name). */
  name: z.string().optional(),
  /** Started outside Mesa, then adopted (CONTEXT.md, Adopted session). */
  adopted: z.literal(true).optional(),
  /**
   * The folder its agent runs in, when that is neither the project's nor its worktree: an adopted
   * session's own, where claude keeps its conversation.
   */
  cwd: z.string().optional(),
  /** The git worktree it runs in (mesa open --branch; CONTEXT.md, Worktree). */
  worktree: z
    .strictObject({ path: z.string(), branch: z.string(), base: z.string().optional() })
    .optional(),
  tmux: z.strictObject({ socket: z.string(), session: z.string(), window: z.string() }),
  startedAt: z.iso.datetime(),
  endedAt: z.iso.datetime().optional(),
  lastState: z.strictObject({
    state: z.enum(SESSION_STATES),
    confidence: z.number().min(0).max(1),
    at: z.iso.datetime(),
    /**
     * ADR-0003's signals (hook, listing, tmux, and tmux's pane-died hook), Faro's adapter when the
     * rules were unsure, or Mesa's own action (open, stop).
     */
    source: z.enum(['hook', 'listing', 'tmux', 'tmux-hook', 'adapter', 'mesa']),
    /** With `adapter`: a hash of what it saw, so an unchanged session is not asked again. */
    basis: z.string().optional(),
  }),
  lastOutput: z.string().optional(),
  /**
   * What happened to the session that Mesa keeps: prompts sent to it and by it, and its agent's
   * exit. Claude Code's hook events go to sessions/events/ instead.
   */
  events: z.array(
    z.discriminatedUnion('type', [
      z.strictObject({
        type: z.literal('send'),
        at: z.iso.datetime(),
        chars: z.number(),
        /** The session that sent it (mesa send --from). */
        from: z.string().regex(SHORT_ID).optional(),
      }),
      /** Its agent exited: tmux's pane-died hook said so (mesa hook tmux). */
      z.strictObject({ type: z.literal('exited'), at: z.iso.datetime() }),
      z.strictObject({
        type: z.literal('sent'),
        at: z.iso.datetime(),
        chars: z.number(),
        to: z.string().regex(SHORT_ID),
      }),
    ]),
  ),
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

/** The Mesa session id in a window's name (`claude-a1b2c3d4`), if it has one. */
export const idOfWindow = (window: string) => /^[a-z]+-([0-9a-z]{8})$/.exec(window)?.[1];

/** The session's window on the profile's tmux server. */
export const windowOf = (r: SessionRecord): WindowTarget => ({
  project: r.tmux.session,
  window: r.tmux.window,
});

/**
 * The Mesa session whose window this runs in: MESA_SESSION_ID, when its record is here. A window
 * of another profile (MESA_PROFILE names it), or of a removed session, gives none.
 */
export function windowSession(deps: {
  store: SessionStore;
  env: Env;
  profileName: string;
}): SessionRecord | undefined {
  const own = deps.env.MESA_SESSION_ID;
  const windowProfile = deps.env.MESA_PROFILE ?? deps.profileName;
  if (!own || windowProfile !== deps.profileName) return undefined;
  return deps.store.find(own);
}

type Patch = Partial<Omit<SessionRecord, 'id'>>;

/** The ULID's last 8 characters are random: 40 bits, and short enough to type. */
const shortId = (newId: IdSource) => newId().slice(-8).toLowerCase();

export function sessionStore({ dir, newId }: { dir: string; newId: IdSource }) {
  /** The record's file; an id that is not a short id names no session, and never a path. */
  const fileOf = (id: string) => {
    if (id.startsWith(FOREIGN))
      throw new MesaError('not_found', `${id}: session not managed by mesa`);
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
  /**
   * Runs `fn` holding the record's lock (`<id>.lock` beside it), so read-modify-write updates of
   * one record serialise across processes: a send from two sessions at once keeps both events.
   */
  const locked = <T>(id: string, fn: () => T, tries?: number): T => {
    const lock = fileOf(id).replace(/\.json$/, '.lock');
    const busy = () =>
      new MesaError(
        'locked',
        `session ${id} is locked by another mesa process (${lock}); retry, or delete that file if no mesa is running`,
        { reason: 'session' },
      );
    return withLockSync(lock, fn, busy, tries);
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
    /** The record, or undefined when this profile has none (removed, foreign, or not an id). */
    find: (id: string): SessionRecord | undefined => {
      try {
        return get(id);
      } catch (error) {
        if (error instanceof MesaError && error.code === 'not_found') return undefined;
        throw error;
      }
    },
    /**
     * Merges `patch` into the record under its lock; a function gets the record as it is now,
     * for a change that depends on it (appending an event). With `wait: false` a held lock is
     * refused at once, for a write that can wait for the next look.
     */
    update: (
      id: string,
      patch: Patch | ((current: SessionRecord) => Patch),
      { wait = true } = {},
    ) =>
      locked(
        id,
        () => {
          const current = get(id);
          const change = typeof patch === 'function' ? patch(current) : patch;
          return write({ ...current, ...change, id });
        },
        wait ? undefined : 0,
      ),
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
    /** Under the lock, so an update that waited for it cannot write the record back. */
    remove: (id: string) =>
      locked(id, () => {
        get(id);
        rmSync(fileOf(id));
      }),
  };
}

export type SessionStore = ReturnType<typeof sessionStore>;
