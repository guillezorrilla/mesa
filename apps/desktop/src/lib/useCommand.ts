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

type CommandError = Extract<Result<unknown>, { ok: false }>['error'];

/**
 * The last good reply to each command and its arguments, per client (one per MesaRoot): a screen
 * shown again starts from it while it reloads, rather than from nothing.
 * ponytail: unbounded, one entry per command and arguments read; an LRU if that ever grows large.
 */
const replies = new WeakMap<Client, Map<string, unknown>>();
/** Cached reads belong to the folder they read, even when their command arguments stay the same. */
export const CommandScope = createContext<string | undefined>(undefined);
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
  const toast = useToast();
  const cached = repliesOf(useClient());
  // By value: a caller passes a fresh object each render.
  const key = JSON.stringify([name, args, useContext(CommandScope)]);
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

  const refresh = useCallback(async () => {
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
      setState({ key, data: result.data, busy: false });
    } else {
      setState((last) => ({ ...last, error: result.error, busy: false }));
      if (toastMissing || result.error.code !== 'not_found') toast(result.error.message);
    }
  }, [call, toast, cached, name, key, toastMissing]);

  useEffect(() => {
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);

  return {
    data: state.key === key ? state.data : (cached.get(key) as DataOf<K> | undefined),
    error: state.key === key ? state.error : undefined,
    busy: state.key === key && state.busy,
    refresh,
  };
}
