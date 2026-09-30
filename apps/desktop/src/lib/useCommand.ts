import type { Result } from '@mesa/core';
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useToast } from '../components/Toast';
import type { CallArgs, CommandName, DataOf } from './client';
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
export type CommandState<T> = {
  data: T | undefined;
  error?: CommandError;
  busy: boolean;
  refresh: () => Promise<void>;
};

/**
 * Runs a command on mount, again when its arguments change, and on `refresh()`. A refresh keeps
 * the last good data for the same command and arguments; superseded replies cannot replace it.
 */
export function useCommand<K extends CommandName>(
  name: K,
  ...args: CallArgs<K>
): CommandState<DataOf<K>> {
  const call = useCall();
  const toast = useToast();
  // By value: a caller passes a fresh object each render.
  const key = JSON.stringify([name, args]);
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
    data: undefined,
    busy: false,
  });

  const refresh = useCallback(async () => {
    const id = ++request.current;
    setState((last) => ({
      key,
      data: last.key === key ? last.data : undefined,
      error: last.key === key ? last.error : undefined,
      busy: true,
    }));
    const result = await call(name, ...(JSON.parse(key)[1] as CallArgs<K>));
    if (id !== request.current || key !== currentKey.current) return;
    if (result.ok) setState({ key, data: result.data, busy: false });
    else {
      setState((last) => ({ ...last, error: result.error, busy: false }));
      toast(result.error.message);
    }
  }, [call, toast, name, key]);

  useEffect(() => {
    void refresh();
    return () => {
      request.current++;
    };
  }, [refresh]);

  return {
    data: state.key === key ? state.data : undefined,
    error: state.key === key ? state.error : undefined,
    busy: state.key === key && state.busy,
    refresh,
  };
}
