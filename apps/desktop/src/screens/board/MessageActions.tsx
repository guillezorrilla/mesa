import type { NativeResponse } from '@mesa/core';
import { Copy, MessageSquareQuote } from 'lucide-react';
import { type ReactNode, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { said } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

// A press keeps the focus where it was, so xterm keeps the keyboard.
const keepFocus = (event: { preventDefault: () => void }) => event.preventDefault();

/**
 * Copy and Review for the agent's latest response, over a session terminal while the pointer is
 * on it. Each hover reads the responses again; with none yet, nothing shows.
 */
export function MessageActions(props: {
  sessionId: string;
  className?: string;
  onReview: (response: NativeResponse) => void;
  children: ReactNode;
}) {
  const call = useCall();
  const platform = usePlatform();
  const { act } = useAct();
  const [hovered, setHovered] = useState(false);
  const [latest, setLatest] = useState<NativeResponse>();
  const request = useRef(0);
  const look = async () => {
    const id = ++request.current;
    const result = await call('review.responses', { id: props.sessionId });
    if (id === request.current) setLatest(result.ok ? result.data.rows[0] : undefined);
  };
  return (
    <section
      aria-label={`Session ${props.sessionId} terminal`}
      className={cn('relative flex min-h-0 flex-col', props.className)}
      onMouseEnter={() => {
        setHovered(true);
        // A response read on an earlier hover may be stale: show none until this read answers.
        setLatest(undefined);
        void look();
      }}
      onMouseLeave={() => setHovered(false)}
    >
      {props.children}
      {hovered && latest && (
        <div
          role="toolbar"
          aria-label="Latest response actions"
          className="absolute top-2 right-4 z-10 flex gap-0.5 rounded-md border bg-card/95 p-0.5 shadow-sm"
        >
          <IconButton
            label="Copy latest response"
            icon={Copy}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() =>
              void act(async () => {
                await platform.clipboard.write(latest.text);
                return said('Response copied');
              })
            }
          />
          <IconButton
            label="Review latest response"
            icon={MessageSquareQuote}
            tabIndex={-1}
            onMouseDown={keepFocus}
            onClick={() => props.onReview(latest)}
          />
        </div>
      )}
    </section>
  );
}
