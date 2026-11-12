import type { TreeRow } from '@mesa/core';
import { WAITING_STATES } from '@mesa/core/browser';
import { PendingPromptCard } from './PendingPromptCard';

/**
 * The selected session's pending prompt while it waits on a person (CONTEXT.md, Pending prompt);
 * read again for each new one, whose hook moves the state's time.
 */
export function PromptCard(props: { row?: TreeRow }) {
  const { row } = props;
  if (!row?.managed || !WAITING_STATES.has(row.lastState.state)) return null;
  return <PendingPromptCard key={`${row.id}:${row.lastState.at}`} session={row.id} />;
}
