import { Stack } from 'expo-router';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { PromptCard } from '../prompt/PromptCard';
import { OutputTail } from './OutputTail';
import { ReplyList } from './ReplyList';
import { SessionHeader } from './SessionHeader';
import { groupOf } from './sessionState';
import type { DetailRead } from './useSessionDetail';

/** What a session said and is doing: state, its pending prompt, goal, latest replies, output tail. */
export function SessionBody({ read }: { read: Promise<DetailRead> }) {
  const { detail, error } = use(read);
  if (!detail) return <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>;
  const now = Date.now();
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: detail.row.title }} />
      {error ? <ErrorNote text={error} /> : null}
      <SessionHeader row={detail.row} now={now} />
      <PromptCard
        id={detail.row.id}
        waiting={groupOf(detail.row.state) === 'needs-you'}
        since={detail.row.since}
      />
      {detail.goal ? (
        <Section title="Goal">
          <Text selectable>{detail.goal}</Text>
        </Section>
      ) : null}
      <Section title="Replies">
        <ReplyList replies={detail.replies} now={now} />
      </Section>
      <Section title="Output">
        <OutputTail lines={detail.tail} />
      </Section>
    </Screen>
  );
}
