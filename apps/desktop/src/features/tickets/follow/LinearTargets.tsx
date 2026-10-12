import type { LinearCustomView, LinearProject } from '@mesa/core';
import { useEffect } from 'react';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { SourceError } from '@/features/projects/import/SourceError';
import { useCommand } from '@/lib/useCommand';
import { cycleDates } from '../linear/cycleDates';
import { type Choice, ChoiceRows } from './ChoiceRows';
import { StepLabel } from './StepLabel';

/** What a Linear view follows in a team: one of its cycles, one of its projects, or a saved view. */
export type LinearWhat = 'cycle' | 'project' | 'view';
/** The project or saved view picked, by id and name. */
export type Picked = { id: string; name: string };

const WHATS = [
  ['cycle', 'Cycle'],
  ['project', 'Project'],
  ['view', 'Saved view'],
] as const;

/** A project's progress at the row's end: its percent and a bar in Linear's tint. */
function Progress(props: { project: LinearProject }) {
  const percent = Math.round(props.project.progress * 100);
  return (
    <span className="inline-flex items-center gap-1.5">
      {percent}%
      <span className="inline-block h-1 w-13 overflow-hidden rounded-sm bg-muted">
        <span className="block h-full bg-tracker-linear" style={{ width: `${percent}%` }} />
      </span>
    </span>
  );
}

/** Whose a saved view is: its team's, the workspace's, or the person's own. */
const whose = (view: LinearCustomView) =>
  view.team ? `${view.team.name} team view` : view.shared ? 'Workspace view' : 'Your view';

/**
 * A Linear Follow dialog's second step, "What to follow" in team `team`: Cycle (current or next,
 * with dates), Project (with lead and progress) or Saved view, as tabs over their choices. The
 * first project or saved view is picked until the person picks another. A failed read says why,
 * with Connect, Reconnect or Try again, in place of the choices.
 */
export function LinearTargets(props: {
  team: string;
  what: LinearWhat;
  cycle: 'current' | 'next';
  picked: Picked | undefined;
  onWhat: (what: LinearWhat) => void;
  onCycle: (cycle: 'current' | 'next') => void;
  onPick: (picked: Picked) => void;
}) {
  const work = useCommand('tickets.team', { team: props.team });
  const data = work.data?.team.id === props.team ? work.data : undefined;
  const cycles = data?.cycles;
  const lists: Record<Exclude<LinearWhat, 'cycle'>, Choice[] | undefined> = {
    project: data?.projects.map((p) => ({
      id: p.id,
      name: p.name,
      ...(p.lead ? { sub: `Lead ${p.lead}` } : {}),
      hint: <Progress project={p} />,
    })),
    view: data?.views.map((v) => ({ id: v.id, name: v.name, sub: whose(v) })),
  };
  const choices = props.what === 'cycle' ? undefined : lists[props.what];
  const first = choices?.[0];
  const { picked, onPick } = props;
  useEffect(() => {
    if (!picked && first) onPick({ id: first.id, name: first.name });
  }, [picked, first, onPick]);
  const cycleChoices: Choice[] = (['current', 'next'] as const).map((which) => {
    const cycle = cycles?.[which];
    return {
      id: which,
      name: which === 'current' ? 'Current cycle' : 'Next cycle',
      sub: cycle
        ? `${cycle.name}, ${cycleDates(cycle)}`
        : cycles
          ? `No ${which === 'current' ? 'active' : 'next'} cycle yet`
          : 'Reading cycles...',
    };
  });
  if (work.error && !data)
    return <SourceError source="linear" error={work.error} onRetry={work.refresh} />;
  return (
    <div className="grid gap-2">
      <StepLabel step={2}>What to follow</StepLabel>
      <SegmentedControl
        label="What to follow"
        options={WHATS}
        value={props.what}
        onChange={props.onWhat}
        className="w-fit"
      />
      {props.what === 'cycle' ? (
        <>
          <ChoiceRows
            label="Cycle"
            name="linear-cycle"
            choices={cycleChoices}
            picked={props.cycle}
            onPick={(c) => props.onCycle(c.id as 'current' | 'next')}
          />
          <Muted className="text-[12.5px]">
            When a cycle ends, the view moves to the next one on its own.
          </Muted>
        </>
      ) : (
        <ChoiceRows
          label={props.what === 'project' ? 'Project' : 'Saved view'}
          name={`linear-${props.what}`}
          choices={choices}
          picked={props.picked?.id}
          onPick={(c) => props.onPick({ id: c.id, name: c.name })}
        />
      )}
    </div>
  );
}
