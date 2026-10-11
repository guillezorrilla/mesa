import type { ProviderId, SourceRow } from '@mesa/core';
import { Check, ChevronRight } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { useConnect } from '@/lib/useConnect';
import { cn } from '@/lib/utils';
import { TRACKER_IDS, TRACKERS } from './trackers';

/** A tracker with nothing more to do once signed in. */
const Open = (props: { children: ReactNode }) => props.children;

/** One tracker's row: its icon, name, a line under it, and what to do. */
function Row(props: { tracker: ProviderId; hint: ReactNode; children: ReactNode }) {
  const { icon: Icon, tint, name } = TRACKERS[props.tracker];
  return (
    <div
      data-testid="tracker-choice"
      className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 border-t px-3.5 py-3"
    >
      <span className={cn('grid size-8 place-items-center rounded-lg bg-muted', tint)}>
        <Icon aria-hidden className="size-[18px]" />
      </span>
      <span className="grid">
        <span className="text-sm font-medium">{name}</span>
        {props.hint}
      </span>
      {props.children}
    </div>
  );
}

/**
 * A project with no tracker yet: "Where does this project track work?", the trackers whose source
 * is connected first, each with Use, then the rest with Connect, which signs in here. A tracker
 * may need one more step once signed in (TRACKERS' Gate: GitHub's app reaching a repo).
 */
export function TrackerChoice(props: { project: string; onChosen: (tracker: ProviderId) => void }) {
  const sources = useCommand('sources.list');
  const run = useRun();
  const { acting, act } = useAct();
  const { signingIn, connect } = useConnect();
  const [pending, setPending] = useState<ProviderId>();
  const rowOf = (tracker: ProviderId): SourceRow | undefined =>
    sources.data?.sources.find((s) => s.id === TRACKERS[tracker].source);
  const ready = (tracker: ProviderId) => rowOf(tracker)?.status === 'connected';
  const on = TRACKER_IDS.filter(ready);
  const off = TRACKER_IDS.filter((t) => !ready(t));
  const use = (tracker: ProviderId) =>
    void act(async () => {
      if (await run('tickets.tracker', { project: props.project, tracker }))
        props.onChosen(tracker);
      return undefined;
    });
  const signIn = (tracker: ProviderId) =>
    void act(async () => {
      setPending(tracker);
      await connect(TRACKERS[tracker].source);
      await sources.refresh();
      return undefined;
    });
  const connectedRow = (tracker: ProviderId) => {
    const { short, Gate = Open } = TRACKERS[tracker];
    const account = rowOf(tracker)?.account;
    return (
      <Row
        key={tracker}
        tracker={tracker}
        hint={
          <Muted size="xs" className="flex items-center gap-1 text-state-idle">
            <Check aria-hidden className="size-3" />
            {account ? `Connected as ${account.email ?? account.name}` : 'Connected'}
          </Muted>
        }
      >
        <Gate project={props.project}>
          <Button variant="ghost" size="sm" disabled={acting} onClick={() => use(tracker)}>
            Use {short}
            <ChevronRight aria-hidden />
          </Button>
        </Gate>
      </Row>
    );
  };
  return (
    <div className="grid place-items-center px-6 py-12">
      <div className="grid w-full max-w-xl justify-items-center gap-5 text-center">
        <div className="grid justify-items-center gap-2.5">
          <h2 className="text-lg font-semibold tracking-tight">
            Where does this project track work?
          </h2>
          <Muted className="max-w-[46ch]">
            Pick the tool your team uses. Its work shows up here and any item starts a session. You
            can change it later from the gear.
          </Muted>
        </div>
        <div className="w-full overflow-hidden rounded-xl border text-left [&>*:first-child]:border-t-0">
          {on.length > 0 && <Caption>Connected</Caption>}
          {on.map(connectedRow)}
          {off.length > 0 && <Caption>Not connected yet</Caption>}
          {off.map((tracker) => (
            <Row
              key={tracker}
              tracker={tracker}
              hint={<Muted size="xs">{TRACKERS[tracker].signIn}</Muted>}
            >
              <Button variant="outline" size="sm" disabled={acting} onClick={() => signIn(tracker)}>
                {signingIn && pending === tracker
                  ? 'Waiting for sign-in...'
                  : rowOf(tracker)?.connected
                    ? 'Reconnect'
                    : 'Connect'}
              </Button>
            </Row>
          ))}
        </div>
        <Muted size="xs">Signing in opens your browser and comes back here.</Muted>
      </div>
    </div>
  );
}

/** A section's name in the choice's list. */
function Caption(props: { children: ReactNode }) {
  return (
    <div className="border-t bg-muted/55 px-3.5 py-2 text-xs text-muted-foreground">
      {props.children}
    </div>
  );
}
