import type { Result } from '@mesa/core';
import { useCallback, useEffect, useState } from 'react';
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

export type CommandState<T> = { data: T | undefined; busy: boolean; refresh: () => Promise<void> };

/**
 * Runs a command on mount, again when its arguments change, and on `refresh()`, keeping the last
 * good data.
 */
export function useCommand<K extends CommandName>(
  name: K,
  ...args: CallArgs<K>
): CommandState<DataOf<K>> {
  const run = useRun() as (name: K, ...args: CallArgs<K>) => Promise<DataOf<K> | undefined>;
  const [data, setData] = useState<DataOf<K>>();
  const [busy, setBusy] = useState(false);
  // By value: a caller passes a fresh object each render.
  const key = JSON.stringify(args);

  const refresh = useCallback(async () => {
    setBusy(true);
    const next = await run(name, ...(JSON.parse(key) as CallArgs<K>));
    if (next !== undefined) setData(next);
    setBusy(false);
  }, [run, name, key]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, busy, refresh };
}
