import { sessionLabel } from '@mesa/core/browser';
import { useCommand } from '@/lib/useCommand';

/** All sessions, one live session, or a past session whose usage is still retained. */
export function UsageScope(props: {
  value: string;
  /** Sessions seen in the all-sessions report, so retained ones stay selectable. */
  retained: readonly string[];
  onChange: (session: string) => void;
}) {
  const sessions = useCommand('sessions.all');
  const live = sessions.data?.filter((row) => row.managed && row.agent !== 'terminal') ?? [];
  return (
    <select
      aria-label="Usage scope"
      className="h-7 max-w-56 rounded-md border bg-card px-2 text-xs text-foreground"
      value={props.value}
      onChange={(event) => props.onChange(event.target.value)}
    >
      <option value="">All sessions</option>
      {live.map((row) => (
        <option key={row.id} value={row.id}>
          {sessionLabel(row)} ({row.id})
        </option>
      ))}
      {props.retained
        .filter((id) => !live.some((row) => row.id === id))
        .map((id) => (
          <option key={id} value={id}>
            {id} (retained usage)
          </option>
        ))}
    </select>
  );
}
