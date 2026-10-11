import type { ProviderId } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { TrackerIcon } from './TrackerIcon';
import { TRACKER_IDS, TRACKERS } from './trackers';

/** `n` of `unit`, such as "1 view" or "3 repos". */
const count = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/**
 * Changing where a project tracks work, behind the gear: the trackers, the current one marked
 * Now, and what happens: the old views stay saved and unlisted, switching back restores them, and
 * sessions already started keep running.
 */
export function SwitchTrackerDialog(props: {
  project: string;
  tracker: ProviderId;
  onSwitched: () => void;
  onCancel: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const sources = useCommand('sources.list');
  const views = useCommand('tickets.views');
  const [to, setTo] = useState<ProviderId>(
    TRACKER_IDS.find((t) => t !== props.tracker) ?? props.tracker,
  );
  // How many views of each tracker the project follows, the unlisted ones too.
  const followed: Partial<Record<ProviderId, number>> = {};
  for (const view of views.data ?? [])
    if (view.following.includes(props.project))
      followed[view.provider] = (followed[view.provider] ?? 0) + 1;
  const from = TRACKERS[props.tracker];
  const next = TRACKERS[to];
  const n = followed[props.tracker] ?? 0;
  const m = followed[to] ?? 0;
  const connected = (tracker: ProviderId) =>
    sources.data?.sources.find((s) => s.id === TRACKERS[tracker].source)?.status === 'connected';
  const submit = () =>
    void act(async () => {
      if (await run('tickets.tracker', { project: props.project, tracker: to })) props.onSwitched();
      return undefined;
    });
  return (
    <ActionDialog
      testId="switch-tracker-dialog"
      title={`Change where ${props.project} tracks work`}
      description="The Tickets tab shows one tracker at a time."
      submit={{
        label: `Switch to ${next.short}`,
        testId: 'confirm-switch-tracker',
        disabled: acting || to === props.tracker,
      }}
      onSubmit={submit}
      onCancel={props.onCancel}
    >
      <RadioGroup
        aria-label="Tracker"
        value={to}
        onValueChange={(value) => setTo(value as ProviderId)}
        className="gap-0 overflow-hidden rounded-xl border"
      >
        {TRACKER_IDS.map((tracker) => {
          const now = tracker === props.tracker;
          return (
            <Label
              key={tracker}
              htmlFor={`tracker-${tracker}`}
              className="flex items-center gap-3 border-t px-3 py-2.5 font-normal first:border-t-0"
            >
              <RadioGroupItem id={`tracker-${tracker}`} value={tracker} disabled={now} />
              <TrackerIcon tracker={tracker} />
              <span className="grid flex-1">
                {TRACKERS[tracker].name}
                <span className="text-xs text-muted-foreground">
                  {now || connected(tracker) ? 'Connected' : "Not connected: you'll sign in next"}
                </span>
              </span>
              {now && (
                <span className="rounded-full border px-2 text-[11.5px] text-muted-foreground">
                  Now
                </span>
              )}
            </Label>
          );
        })}
      </RadioGroup>
      <div
        className="grid gap-1.5 rounded-lg bg-muted px-3.5 py-3 text-sm"
        data-testid="switch-note"
      >
        <p>
          <b className="font-medium">
            Your {count(n, `${from.name} ${from.unit}`)} {n === 1 ? 'stays' : 'stay'} saved.
          </b>{' '}
          This tab stops listing them and shows {next.short} instead
          {m
            ? `, starting with the ${count(m, `${next.short} ${next.unit}`)} you followed before.`
            : "; you'll pick what to follow next."}
        </p>
        <p>
          <b className="font-medium">To go back,</b> choose {from.name} here again: its {from.unit}s
          return as they were. Sessions already started keep running.
        </p>
      </div>
    </ActionDialog>
  );
}
