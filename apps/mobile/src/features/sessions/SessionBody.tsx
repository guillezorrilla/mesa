import { Stack } from 'expo-router';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { OutputTail } from './OutputTail';
import { QueuedList } from './QueuedList';
import { ReplyList } from './ReplyList';
import { SessionHeader } from './SessionHeader';
import { SessionMenu } from './SessionMenu';
import type { DetailRead } from './useSessionDetail';

/**
 * What a session said and is doing: state, goal, replies waiting for its turn, latest replies,
 * output tail; its menu in the header. `onChange` reads it again after the phone changed it.
 */
export function SessionBody({
  read,
  onChange,
}: {
  read: Promise<DetailRead>;
  onChange: () => void;
}) {
  const { detail, error } = use(read);
  if (!detail) return <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>;
  const now = Date.now();
  return (
    <Screen className="gap-6">
      <Stack.Screen
        options={{
          title: detail.row.title,
          headerRight: () => <SessionMenu row={detail.row} onDone={onChange} />,
        }}
      />
      {error ? <ErrorNote text={error} /> : null}
      <SessionHeader row={detail.row} now={now} />
      {detail.goal ? (
        <Section title="Goal">
          <Text selectable>{detail.goal}</Text>
        </Section>
      ) : null}
      {detail.queued.length ? (
        <Section title="Queued">
          <QueuedList id={detail.row.id} queued={detail.queued} onChange={onChange} />
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
