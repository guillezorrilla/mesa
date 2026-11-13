import type { PhoneThread } from '@mesa/core/phone';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { ThreadCard } from './ThreadCard';

/** My threads on the PR; Resolve only where Mesa can (GitHub). */
export function ThreadsSection({
  threads,
  onReply,
  onResolve,
  canResolve,
}: {
  threads: PhoneThread[];
  onReply: (thread: PhoneThread) => void;
  onResolve: (thread: PhoneThread) => void;
  canResolve: boolean;
}) {
  return (
    <Section title="Your threads">
      {threads.length ? (
        threads.map((thread) => (
          <ThreadCard
            key={thread.id}
            thread={thread}
            onReply={() => onReply(thread)}
            onResolve={canResolve ? () => onResolve(thread) : undefined}
          />
        ))
      ) : (
        <Text variant="muted">You have no threads on this PR.</Text>
      )}
    </Section>
  );
}
