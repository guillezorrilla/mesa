import { z } from 'zod';
import { changeJson, readJson } from '../lib/json-file.js';
import type { LockDeps } from '../lib/lock-file.js';
import { failingKey, type PrDelivered, type PrEvent, type PrScan } from './pr-events.js';

const State = z
  .strictObject({
    delivered: z.array(z.string()).default([]),
    failing: z.array(z.string()).default([]),
  })
  .describe('PR event state');
type State = z.infer<typeof State>;

/** Ids kept: far more than the events of the sessions live at once. */
const KEPT = 2_000;

/**
 * The profile's record of PR events forwarded into sessions, `pr-events.json`: each event id once
 * claimed, so it is sent once across restarts and processes, and the checks a forwarded failure
 * left failing, so their fix is news.
 */
export function prEventLedger(file: string, deps: LockDeps) {
  const read = (): State => readJson(file, State) ?? { delivered: [], failing: [] };
  const change = <T>(fn: (state: State) => { next: State; result: T }): T => {
    let result: T | undefined;
    changeJson(
      file,
      State,
      (current) => {
        const changed = fn(current ?? { delivered: [], failing: [] });
        result = changed.result;
        return { ...changed.next, delivered: changed.next.delivered.slice(-KEPT) };
      },
      deps,
    );
    return result as T;
  };
  /** The failing checks once `events` are told: a failure adds its check, a fix removes it. */
  const moveFailing = (failing: readonly string[], events: readonly PrEvent[], told: boolean) => {
    const keys = new Set(failing);
    for (const event of events) {
      if (event.kind !== 'check-failed' && event.kind !== 'check-fixed') continue;
      const failed = (event.kind === 'check-failed') === told;
      if (failed) keys.add(failingKey(event));
      else keys.delete(failingKey(event));
    }
    return [...keys];
  };
  return {
    read: (): PrDelivered => {
      const state = read();
      return { delivered: new Set(state.delivered), failing: new Set(state.failing) };
    },
    /**
     * Claims `events` for one send, under the lock: those no other process claimed first, which
     * are then delivered for every later read. A send that did not happen gives them back.
     */
    claim: (events: readonly PrEvent[]) =>
      change((state) => {
        const taken = new Set(state.delivered);
        const claimed = events.filter((event) => !taken.has(event.id));
        return {
          next: {
            delivered: [...state.delivered, ...claimed.map((event) => event.id)],
            failing: moveFailing(state.failing, claimed, true),
          },
          result: claimed,
        };
      }),
    /**
     * Drops the failing checks a fix can no longer follow: a session's that is not `live`, and
     * one a read in full (`checked`) shows gone, its pull request closed or the check removed.
     * A pull request that could not be read keeps its marks.
     */
    prune: (live: ReadonlySet<string>, checked: PrScan['checked']) => {
      const keyOf = (c: PrScan['checked'][number], check = '') =>
        failingKey({ session: c.session, project: c.project, pr: { number: c.pr }, check });
      const keep = (key: string) => {
        if (![...live].some((session) => key.startsWith(`${session}:`))) return false;
        const read = checked.find((c) => key.startsWith(keyOf(c)));
        return !read || read.checks.some((check) => key === keyOf(read, check));
      };
      const state = read();
      if (state.failing.every(keep)) return;
      change((current) => ({
        next: { ...current, failing: current.failing.filter(keep) },
        result: undefined,
      }));
    },
    /** Gives back claimed `events` whose send was refused before anything was typed. */
    release: (events: readonly PrEvent[]) =>
      change((state) => {
        const ids = new Set(events.map((event) => event.id));
        return {
          next: {
            delivered: state.delivered.filter((id) => !ids.has(id)),
            failing: moveFailing(state.failing, events, false),
          },
          result: undefined,
        };
      }),
  };
}
