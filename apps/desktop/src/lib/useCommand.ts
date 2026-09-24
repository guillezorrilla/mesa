import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import type { CallArgs, CommandName, DataOf } from './client';
import { useClient } from './MesaRoot';

/** Calls a command and resolves with its data; a failure goes to the toast and resolves undefined. */
export function useRun() {
  const client = useClient();
  const toast = useToast();
  return useCallback(
    async <K extends CommandName>(
      name: K,
      ...args: CallArgs<K>
    ): Promise<DataOf<K> | undefined> => {
      try {
        const result = await client.call(name, ...args);
        if (result.ok) return result.data;
        toast(result.error.message);
      } catch (error) {
        toast(error instanceof Error ? error.message : String(error));
      }
    },
    [client, toast],
  );
}

type NoArgCommand = { [K in CommandName]: CallArgs<K> extends [] ? K : never }[CommandName];

export type CommandState<T> = { data: T | undefined; busy: boolean; refresh: () => Promise<void> };

/** Runs a command on mount and on `refresh()`, keeping the last good data. */
export function useCommand<K extends NoArgCommand>(name: K): CommandState<DataOf<K>> {
  const run = useRun() as (name: K) => Promise<DataOf<K> | undefined>;
  const [data, setData] = useState<DataOf<K>>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    const next = await run(name);
    if (next !== undefined) setData(next);
    setBusy(false);
  }, [run, name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, busy, refresh };
}
