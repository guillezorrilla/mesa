import type { ControlChange, ManagedRow } from '@mesa/core';
import { useState } from 'react';
import { useCall, useCommand } from '@/lib/useCommand';
import { useRefreshOnStamp } from '../selected/useRefreshOnStamp';

/**
 * A Structured session's controls (ADR-0029): its model, effort and mode as the agent confirmed
 * them, read again as its state changes or its chat grows (`items`); `apply` changes one and keeps the agent's refusal in
 * `failure` for the bar to show; `checkUsage` asks the agent for `/usage`.
 */
export function useSessionControls(row: ManagedRow, items = 0) {
  const controls = useCommand('sessions.controls', { id: row.id });
  // A new chat item too: a change made from `/model`'s card adds one, and the footer follows it.
  useRefreshOnStamp(`${row.lastState.state} ${row.lastState.at} ${items}`, controls.refresh);
  const call = useCall();
  const [applying, setApplying] = useState(false);
  const [failure, setFailure] = useState<string>();
  const apply = async (change: ControlChange) => {
    setApplying(true);
    setFailure(undefined);
    const done =
      change.mode === undefined
        ? await call('sessions.model', { id: row.id, ...change })
        : await call('sessions.mode', { id: row.id, mode: change.mode });
    if (done.ok) controls.mutate(() => done.data);
    else setFailure(done.error.message);
    setApplying(false);
  };
  const checkUsage = async () => {
    const sent = await call('sessions.send', { id: row.id, prompt: '/usage' });
    if (!sent.ok) setFailure(sent.error.message);
  };
  return { controls: controls.data, applying, failure, apply, checkUsage };
}
