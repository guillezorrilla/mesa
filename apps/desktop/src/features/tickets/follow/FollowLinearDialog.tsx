import type { LinearTeam, ViewQuery } from '@mesa/core';
import { useState } from 'react';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import type { FollowDialogProps } from '../trackers';
import { FollowDialogFrame } from './FollowDialogFrame';
import { freeName } from './freeName';
import { LinearTargets, type LinearWhat, type Picked } from './LinearTargets';
import { TeamChips } from './TeamChips';

/**
 * Linear's Follow dialog, "Follow Linear issues": the team (its first until another is picked),
 * then what to follow in it, its current or next cycle, a project or a saved view, with Only
 * issues assigned to me, Hide completed and canceled, and the live count. A cycle view is named
 * after the team, the others after what they follow.
 */
export function FollowLinearDialog(props: FollowDialogProps) {
  const run = useRun();
  const { acting, act } = useAct();
  const views = useCommand('tickets.views');
  const teams = useCommand('tickets.teams');
  const [chosen, setChosen] = useState<LinearTeam>();
  const [what, setWhat] = useState<LinearWhat>('cycle');
  const [cycle, setCycle] = useState<'current' | 'next'>('current');
  const [picked, setPicked] = useState<Picked>();
  const [mine, setMine] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const team = chosen ?? teams.data?.[0];
  const narrowing = {
    ...(mine ? {} : { everyone: true }),
    ...(hideDone ? {} : { showDone: true }),
  };
  const target =
    what === 'cycle'
      ? team && { team: team.id, cycle }
      : picked && (what === 'project' ? { project: picked.id } : { view: picked.id });
  const view: ViewQuery | undefined = target && { provider: 'linear', ...target, ...narrowing };
  const base =
    what === 'cycle'
      ? `${team?.name ?? 'Team'} ${cycle === 'next' ? 'next cycle' : 'cycle'}`
      : (picked?.name ?? 'Linear view');
  const name = freeName(
    base,
    (views.data ?? []).map((v) => v.name),
  );
  const follow = () =>
    void act(async () => {
      const followed = view && (await run('tickets.viewsAdd', { view: { name, ...view } }));
      if (
        followed &&
        (await run('tickets.follow', { project: props.project, view: followed.name }))
      )
        props.onFollowed();
      return undefined;
    });
  return (
    <FollowDialogFrame
      tracker="linear"
      title="Follow Linear issues"
      description="They show up in this tab and stay current as cycles change."
      view={view}
      name={name}
      words={{ nouns: 'issues', query: 'the filter Mesa sends' }}
      waiting={teams.data || teams.error ? 'Pick what to follow first.' : 'Reading teams...'}
      labels={{ mine: 'Only issues assigned to me', hideDone: 'Hide completed and canceled' }}
      mine={mine}
      hideDone={hideDone}
      onMine={setMine}
      onHideDone={setHideDone}
      disabled={acting || !view}
      onSubmit={follow}
      onCancel={props.onCancel}
    >
      <TeamChips
        read={teams}
        picked={team?.id}
        onPick={(next) => {
          setChosen(next);
          setPicked(undefined);
        }}
      />
      {team && (
        <LinearTargets
          team={team.id}
          what={what}
          cycle={cycle}
          picked={picked}
          onWhat={(next) => {
            setWhat(next);
            setPicked(undefined);
          }}
          onCycle={setCycle}
          onPick={setPicked}
        />
      )}
    </FollowDialogFrame>
  );
}
