import type { LinearTeam } from '@mesa/core';
import { cn } from '@/lib/utils';
import { StepLabel } from './StepLabel';

/** A Linear Follow dialog's first step: the teams as chips, each its key in its color and its name. */
export function TeamChips(props: {
  teams: LinearTeam[] | undefined;
  picked: string | undefined;
  onPick: (team: LinearTeam) => void;
}) {
  return (
    <div className="grid gap-2">
      <StepLabel step={1}>Team</StepLabel>
      <div className="flex flex-wrap gap-1.5" data-testid="linear-teams">
        {props.teams ? (
          props.teams.map((team) => (
            <button
              key={team.id}
              type="button"
              aria-pressed={props.picked === team.id}
              onClick={() => props.onPick(team)}
              className={cn(
                'inline-flex h-8 items-center gap-2 rounded-lg border pr-3 pl-1.5 text-sm',
                props.picked === team.id && 'border-primary bg-accent',
              )}
            >
              <span
                className="rounded-[5px] bg-tracker-linear px-1.5 py-0.5 font-mono text-[10.5px] font-medium text-white"
                style={team.color ? { backgroundColor: team.color } : undefined}
              >
                {team.key}
              </span>
              {team.name}
            </button>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">Reading teams...</span>
        )}
      </div>
    </div>
  );
}
