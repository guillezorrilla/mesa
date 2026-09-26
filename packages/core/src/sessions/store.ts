import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeFileAtomic } from '../lib/atomic-file.js';
import { type IdSource, shortId } from '../lib/ids.js';
import { lockedBy, withLockSync } from '../lib/lock-file.js';
import { MesaError } from '../lib/result.js';
import { parseWith } from '../lib/schema.js';
import {
  isForeignId,
  isSessionId,
  type NewSession,
  type SessionRecord,
  SessionRecordSchema,
} from './record.js';

// Session records: one JSON file per session in the profile's `sessions/`, outliving tmux.

const RECORD_FILE = /^([0-9a-z]{8})\.json$/;

type Patch = Partial<Omit<SessionRecord, 'id'>>;

export function sessionStore({ dir, newId }: { dir: string; newId: IdSource }) {
  /** The record's file; an id that is not a short id names no session, and never a path. */
  const fileOf = (id: string) => {
    if (isForeignId(id)) throw new MesaError('not_found', `${id}: session not managed by mesa`);
    if (!isSessionId(id)) throw new MesaError('not_found', `no session ${id}`);
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
    const busy = () => lockedBy(`session ${id}`, lock, 'session');
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
