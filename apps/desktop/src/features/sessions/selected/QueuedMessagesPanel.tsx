import { relativeAgo } from '@mesa/core/browser';
import { Clock, Smartphone, X } from 'lucide-react';
import { SectionLabel } from '@/components/SectionLabel';
import { Button } from '@/components/ui/button';
import { useQueuedMessages } from './useQueuedMessages';

/**
 * The replies the phone queued for this session while it worked, outlined dashed as on the
 * phone, each typed in when its turn ends unless removed here first. Nothing when none wait.
 */
export function QueuedMessagesPanel(props: { sessionId: string }) {
  const { queued, remove } = useQueuedMessages(props.sessionId);
  if (!queued.length) return null;
  const now = Date.now();
  return (
    <section
      data-testid="queued-messages"
      aria-label="Queued from your phone"
      className="grid gap-1.5"
    >
      <SectionLabel className="flex items-center gap-1.5 normal-case tracking-normal">
        <Smartphone aria-hidden className="size-3.5" /> Queued from your phone
      </SectionLabel>
      <ul className="grid gap-1.5">
        {queued.map((message) => (
          <li
            key={message.id}
            className="flex items-start gap-2 rounded-md border border-dashed px-2.5 py-2 text-sm"
          >
            <Clock aria-hidden className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
            <div className="grid min-w-0 flex-1 gap-0.5">
              <p className="line-clamp-3 whitespace-pre-wrap break-words">{message.text}</p>
              <p
                className={
                  message.error ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'
                }
              >
                {message.error
                  ? `Not sent: ${message.error}`
                  : `Queued ${relativeAgo(message.at, now)}, sent when this turn ends`}
              </p>
            </div>
            <Button
              variant="ghost"
              size="sm"
              aria-label={`Remove queued reply ${message.id}`}
              onClick={() => void remove(message.id)}
            >
              <X aria-hidden /> Remove
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
