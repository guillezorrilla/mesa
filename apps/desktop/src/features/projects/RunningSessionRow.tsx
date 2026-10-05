import type { NativeLive } from '@mesa/core';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { timeAgo } from '@/lib/timeAgo';

/**
 * A session running now outside Mesa, in Find from sessions: its name, else its first prompt, with
 * its agent, last write and cwd, its id only on hover, with `tick`
 * as a checkbox, or, when it cannot be ticked, `reason` in its place and `onAdopt` as an Adopt
 * button when it can be adopted on its own.
 */
export function RunningSessionRow(props: {
  session: NativeLive;
  disabled: boolean;
  reason?: string;
  onAdopt?: () => void;
  tick: { checked: boolean; disabled: boolean; onChange: (checked: boolean) => void };
}) {
  const { session, tick } = props;
  const name = session.name ?? session.prompt ?? 'Untitled session';
  return (
    <li className="flex items-center gap-2" title={session.id}>
      {props.reason === undefined && (
        <Checkbox
          data-testid="discovery-live-tick"
          aria-label={`Reopen ${name}`}
          checked={tick.checked}
          disabled={props.disabled || tick.disabled}
          onCheckedChange={(on) => tick.onChange(on === true)}
        />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate">{name}</span>
        {props.reason !== undefined && (
          <span data-testid="discovery-live-reason" className="block text-muted-foreground text-xs">
            {props.reason}
          </span>
        )}
      </span>
      <span data-testid="discovery-live-meta" className="shrink-0 text-muted-foreground text-xs">
        {session.agent}
        {session.updatedAt ? ` · ${timeAgo(session.updatedAt)}` : ''}
      </span>
      <span
        className="max-w-48 truncate font-mono text-muted-foreground text-xs"
        title={session.cwd}
      >
        {session.cwd}
      </span>
      {props.onAdopt && (
        <Button
          type="button"
          size="sm"
          variant="outline"
          data-testid="discovery-live-adopt"
          aria-label={`Adopt ${name}`}
          disabled={props.disabled}
          onClick={props.onAdopt}
        >
          Adopt
        </Button>
      )}
    </li>
  );
}
