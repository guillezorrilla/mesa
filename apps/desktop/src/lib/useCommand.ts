import { useCallback, useEffect, useState } from 'react';
import { useToast } from '../components/Toast';
import type { CommandName, DataOf } from './client';
import { useClient } from './MesaRoot';

/** Runs a command on mount and on `refresh()`, keeping the last good data; failures go to the toast. */
export function useCommand<K extends CommandName>(name: K) {
  const client = useClient();
  const toast = useToast();
  const [data, setData] = useState<DataOf<K>>();
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async () => {
    setBusy(true);
    try {
      const result = await client.call(name);
      if (result.ok) setData(result.data);
      else toast(result.error.message);
    } catch (error) {
      toast(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  }, [client, toast, name]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return { data, busy, refresh };
}
