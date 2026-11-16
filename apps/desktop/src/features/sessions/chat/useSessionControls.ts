import type { ControlChange, ManagedRow } from '@mesa/core';
import { useState } from 'react';
import { useCall, useCommand } from '@/lib/useCommand';
import { useRefreshOnStamp } from '../selected/useRefreshOnStamp';

/**
 * A Structured session's controls (ADR-0029): its model, effort and mode as the agent confirmed
 * them, read again as its state changes or its chat grows (`items`). `apply` shows the change at
 * once (`pending`, until the agent answers), then the agent's confirmed values, or rolls back to
 * them and keeps its refusal in `failure` for the bar to show; `checkUsage` asks for `/usage`.
 */
export function useSessionControls(row: ManagedRow, items = 0) {
  const controls = useCommand('sessions.controls', { id: row.id });
  // A new chat item too: a change made from `/model`'s card adds one, and the footer follows it.
  useRefreshOnStamp(`${row.lastState.state} ${row.lastState.at} ${items}`, controls.refresh);
  const call = useCall();
  const [pending, setPending] = useState<ControlChange>();
  const [failure, setFailure] = useState<string>();
  const apply = async (change: ControlChange) => {
    setPending(change);
    setFailure(undefined);
    const done =
      change.mode === undefined
        ? await call('sessions.model', { id: row.id, ...change })
        : await call('sessions.mode', { id: row.id, mode: change.mode });
    if (done.ok) controls.mutate(() => done.data);
    else setFailure(done.error.message);
    setPending(undefined);
  };
  const checkUsage = async () => {
    const sent = await call('sessions.send', { id: row.id, prompt: '/usage' });
    if (!sent.ok) setFailure(sent.error.message);
  };
  const shown = controls.data && pending ? { ...controls.data, ...pending } : controls.data;
  return { controls: shown, pending, applying: pending !== undefined, failure, apply, checkUsage };
}
