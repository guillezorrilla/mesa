import { relativeAgo } from '@mesa/core/phone';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** Who speaks in a group of messages and when it started, small over its first message. */
export function GroupLabel({ you, at, now }: { you: boolean; at: string | null; now: number }) {
  return (
    <Text
      className={cn(
        'font-mono text-[11px] tracking-wider text-muted-foreground uppercase',
        you && 'self-end',
      )}
    >
      {you ? 'You' : 'Agent'}
      {at ? ` · ${relativeAgo(at, now)}` : ''}
    </Text>
  );
}
