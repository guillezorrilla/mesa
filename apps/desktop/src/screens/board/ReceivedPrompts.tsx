import type { TreeRow } from '@mesa/core';
import { when } from './rows';

/** The prompts a session was sent, newest first, each with who sent it (mesa send --from). */
export function ReceivedPrompts({ row }: { row: TreeRow }) {
  if (!row.managed) return null;
  const received = row.events.flatMap((e) => (e.type === 'send' ? [e] : [])).reverse();
  if (!received.length) return null;
  return (
    <details data-testid="session-received" className="text-muted-foreground text-xs">
      <summary className="cursor-pointer select-none hover:text-foreground">
        Received ({received.length})
      </summary>
      <ul className="mt-1 space-y-0.5 pl-3">
        {received.map((e) => (
          <li key={`${e.at}-${e.from ?? ''}-${e.chars}`} data-testid="received-prompt">
            {e.from ? `from session ${e.from}` : 'from a person'}, {e.chars} characters,{' '}
            {when(e.at)}
          </li>
        ))}
      </ul>
    </details>
  );
}
