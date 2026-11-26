import type { Result } from '@mesa/core';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { useToast } from '@/components/Toast';
import type { CallArgs, Client, CommandName, DataOf } from './client';
import { useClient } from './MesaRoot';

/**
 * Calls a command and resolves with its envelope, for a caller that reads a failure's code; a
 * bridge that printed none is an internal failure.
 */
export function useCall() {
  const client = useClient();
  return useCallback(
    async <K extends CommandName>(name: K, ...args: CallArgs<K>): Promise<Result<DataOf<K>>> => {
      try {
        return await client.call(name, ...args);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { ok: false, error: { code: 'internal', message } };
      }
    },
    [client],
  );
}

/** Calls a command and resolves with its data; a failure goes to the toast and resolves undefined. */
export function useRun() {
  const call = useCall();
  const toast = useToast();
  return useCallback(
    async <K extends CommandName>(
      name: K,
      ...args: CallArgs<K>
    ): Promise<DataOf<K> | undefined> => {
      const result = await call(name, ...args);
      if (result.ok) return result.data;
      toast(result.error.message);
    },
    [call, toast],
  );
}

export type CommandError = Extract<Result<unknown>, { ok: false }>['error'];

/**
 * For a read that refreshes by itself: alerts a failure when it first appears or changes, not
 * again while the same one repeats, so a dismissed alert stays closed; a success re-arms it.
 * Pass the failure, or undefined after a success.
 */
export function useNewFailureAlert() {
  const toast = useToast();
  const last = useRef<string>(undefined);
  return useCallback(
    (error: CommandError | undefined) => {
      if (error && error.message !== last.current) toast(error.message);
      last.current = error?.message;
    },
    [toast],
  );
}

/**
 * The last good reply to each command and its arguments, per client (one per MesaRoot): a screen
 * shown again starts from it while it reloads, rather than from nothing.
 * ponytail: unbounded, one entry per command and arguments read; an LRU if that ever grows large.
 */
const replies = new WeakMap<Client, Map<string, unknown>>();
/** Every mounted reader of each command and its arguments, per client, so one reply reaches them all. */
const readers = new WeakMap<Client, Map<string, Set<(data: unknown) => void>>>();
function readersOf(client: Client, key: string) {
  const byKey = readers.get(client) ?? new Map<string, Set<(data: unknown) => void>>();
  readers.set(client, byKey);
  const found = byKey.get(key) ?? new Set();
  byKey.set(key, found);
  return found;
}
/** Cached reads belong to the folder they read, even when their command arguments stay the same. */
export const CommandScope = createContext<string | undefined>(undefined);
/**
 * How long, in ms, a reply counts as fresh for the reads under it: a reader mounted or shown again
 * (a screen kept under Activity) within that time shows the reply it has without reading again.
 * 0, the default, reads on every mount.
 */
export const FreshFor = createContext(0);
/** When each cached reply arrived, per client, for FreshFor. */
const repliedAt = new WeakMap<Client, Map<string, number>>();
function repliedAtOf(client: Client) {
  const found = repliedAt.get(client) ?? new Map<string, number>();
  repliedAt.set(client, found);
  return found;
}
function repliesOf(client: Client) {
  let found = replies.get(client);
  if (!found) {
    found = new Map();
    replies.set(client, found);
  }
  return found;
}
export type CommandState<T> = {
  data: T | undefined;
  error?: CommandError;
  busy: boolean;
  refresh: () => Promise<void>;
  /**
   * refresh, its reply shown by every reader of the same command and arguments too (a sidebar after
   * a write elsewhere); a reader that keeps its order on purpose is refreshed only by its own.
   */
  refreshEverywhere: () => Promise<void>;
  /**
   * Changes the data in place, before the command would say so (a change already saved, or about
   * to be); a read still in flight is dropped, so it cannot bring back what this replaced.
   */
  // A method, so a read of one data type still passes where any read is taken (ViewPicker).
  mutate(update: (data: T) => T): void;
};

/**
 * Runs a command on mount, again when its arguments change, and on `refresh()`; a failure toasts.
 * Until it answers, the data is the last good reply to the same command and arguments, even from before a remount
 * (repliesOf), so a screen shown again never starts blank; superseded replies cannot replace it.
 */
export function useCommand<K extends CommandName>(
  name: K,
  ...args: CallArgs<K>
): CommandState<DataOf<K>> {
  return useRead(true, name, ...args);
}

/**
 * useCommand for a read whose `not_found` is a state the screen shows from `error` (today's note
 * not written yet, a map not made), so only another failure toasts.
 */
export function useOptional<K extends CommandName>(
  name: K,
  ...args: CallArgs<K>
): CommandState<DataOf<K>> {
  return useRead(false, name, ...args);
}

function useRead<K extends CommandName>(
  toastMissing: boolean,
  name: K,
  ...args: CallArgs<K>
): CommandState<DataOf<K>> {
  const call = useCall();
  const alertNew = useNewFailureAlert();
  const client = useClient();
  const cached = repliesOf(client);
  // By value: a caller passes a fresh object each render.
  const key = JSON.stringify([name, args, useContext(CommandScope)]);
  const freshFor = useContext(FreshFor);
  const currentKey = useRef(key);
  useLayoutEffect(() => {
    currentKey.current = key;
  }, [key]);
  const request = useRef(0);
  const [state, setState] = useState<{
    key: string;
    data: DataOf<K> | undefined;
    error?: CommandError;
    busy: boolean;
  }>({
    key,
    data: cached.get(key) as DataOf<K> | undefined,
    busy: false,
  });
  // A reply another reader of the same read shares (refreshEverywhere) shows here too.
  const hear = useRef<(data: unknown) => void>(undefined);
  useEffect(() => {
    const heard = (data: unknown) => {
      request.current++;
      setState({ key, data: data as DataOf<K>, busy: false });
    };
    hear.current = heard;
    const all = readersOf(client, key);
    all.add(heard);
    return () => {
      all.delete(heard);
    };
  }, [client, key]);
  const tell = useCallback(
    (data: unknown) => {
      for (const other of readersOf(client, key)) if (other !== hear.current) other(data);
    },
    [client, key],
  );

  const load = useCallback(
    async (share: boolean) => {
      const id = ++request.current;
      setState((last) => ({
        key,
        data: last.key === key ? last.data : (cached.get(key) as DataOf<K> | undefined),
        error: last.key === key ? last.error : undefined,
        busy: true,
      }));
      const result = await call(name, ...(JSON.parse(key)[1] as CallArgs<K>));
      if (id !== request.current || key !== currentKey.current) return;
      if (result.ok) {
        cached.set(key, result.data);
        repliedAtOf(client).set(key, Date.now());
        setState({ key, data: result.data, busy: false });
        if (share) tell(result.data);
        alertNew(undefined);
      } else {
        setState((last) => ({ ...last, error: result.error, busy: false }));
        if (toastMissing || result.error.code !== 'not_found') alertNew(result.error);
      }
    },
    [call, alertNew, cached, client, name, key, toastMissing, tell],
  );
  const refresh = useCallback(() => load(false), [load]);
  const refreshEverywhere = useCallback(() => load(true), [load]);

  const mutate = useCallback(
    (update: (data: DataOf<K>) => DataOf<K>) => {
      request.current++;
      setState((last) => {
        const shown = last.key === key ? last.data : (cached.get(key) as DataOf<K> | undefined);
        if (shown === undefined) return last;
        const data = update(shown);
        cached.set(key, data);
        return { key, data, busy: false };
      });
    },
    [cached, key],
  );

  useEffect(() => {
    const at = repliedAtOf(client).get(key);
    const fresh = freshFor > 0 && at !== undefined && Date.now() - at < freshFor;
    if (!fresh) void refresh();
    return () => {
      request.current++;
    };
  }, [refresh, client, key, freshFor]);

  return {
    data: state.key === key ? state.data : (cached.get(key) as DataOf<K> | undefined),
    error: state.key === key ? state.error : undefined,
    busy: state.key === key && state.busy,
    refresh,
    refreshEverywhere,
    mutate,
  };
}
