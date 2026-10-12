import type { LinearTeam, ViewQuery } from '@mesa/core';
import { useState } from 'react';
import { useCommand } from '@/lib/useCommand';
import type { FollowDialogProps } from '../trackers';
import { FollowDialogFrame } from './FollowDialogFrame';
import { LinearTargets, type LinearWhat, type Picked } from './LinearTargets';
import { TeamChips } from './TeamChips';
import { useFollowView } from './useFollowView';

/**
 * Linear's Follow dialog, "Follow Linear issues": the team (its first until another is picked),
 * then what to follow in it, its current or next cycle, a project or a saved view, with Only
 * issues assigned to me, Hide completed and canceled, and the live count. A cycle view is named
 * after the team, the others after what they follow.
 */
export function FollowLinearDialog(props: FollowDialogProps) {
  const teams = useCommand('tickets.teams');
  const [chosen, setChosen] = useState<LinearTeam>();
  const [what, setWhat] = useState<LinearWhat>('cycle');
  const [cycle, setCycle] = useState<'current' | 'next'>('current');
  const [picked, setPicked] = useState<Picked>();
  const team = chosen ?? teams.data?.[0];
  const target =
    what === 'cycle'
      ? team && { team: team.id, cycle }
      : picked && (what === 'project' ? { project: picked.id } : { view: picked.id });
  const query: ViewQuery | undefined = target && { provider: 'linear', ...target };
  const base =
    what === 'cycle'
      ? `${team?.name ?? 'Team'} ${cycle === 'next' ? 'next cycle' : 'cycle'}`
      : (picked?.name ?? 'Linear view');
  const { view, name, acting, follow, toggles } = useFollowView(
    props.project,
    props.onFollowed,
    query,
    base,
  );
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
      {...toggles}
      disabled={acting || !view}
      onSubmit={() => follow()}
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
