import type { MessagePart } from '@mesa/core';
import { messageParts } from '@mesa/core/browser';
import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import { LogStack } from './LogStack';

/** One part of a message: a request id (a button when `onRequest` is given), a status, a slow duration. */
function Part(props: { part: MessagePart; onRequest?: (id: string) => void }) {
  const { part, onRequest } = props;
  const { request } = part;
  if (request && onRequest)
    return (
      <button
        type="button"
        title={`Show every line of request ${request}`}
        className="whitespace-nowrap rounded-sm text-state-working underline decoration-dotted underline-offset-2 hover:bg-state-working/10"
        onClick={(event) => {
          event.stopPropagation();
          onRequest(request);
        }}
      >
        {part.text}
      </button>
    );
  if (part.status)
    return (
      <span
        className={cn(
          'font-semibold',
          part.status === 'failed' ? 'text-state-failed' : 'text-state-waiting',
        )}
      >
        {part.text}
      </span>
    );
  if (part.slow)
    return (
      <span className="whitespace-nowrap rounded-sm bg-state-waiting/15 px-0.5 text-state-waiting">
        {part.text}
      </span>
    );
  return part.text;
}

/**
 * A log entry's message with its parts marked (messageParts): request ids to filter by when
 * `onRequest` is given (plain text without it), tinted statuses, slow durations; its stack folded
 * under it (LogStack).
 */
export function MessageBody(props: {
  message: string;
  stack?: string | null;
  onRequest?: (id: string) => void;
}) {
  const parts = useMemo(() => messageParts(props.message), [props.message]);
  return (
    <div className="min-w-0">
      <span className="whitespace-pre-wrap [overflow-wrap:anywhere]">
        {parts.map((part, at) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a message's parts are fixed.
          <Part key={at} part={part} onRequest={props.onRequest} />
        ))}
      </span>
      {props.stack && <LogStack stack={props.stack} />}
    </div>
  );
}
