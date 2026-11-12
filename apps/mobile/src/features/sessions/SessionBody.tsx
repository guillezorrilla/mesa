import { Stack } from 'expo-router';
import { use } from 'react';
import { View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import { OutputTail } from './OutputTail';
import { ReplyList } from './ReplyList';
import { SessionHeader } from './SessionHeader';
import type { DetailRead } from './useSessionDetail';

/** What a session said and is doing: state, goal, latest replies, output tail. */
export function SessionBody({ read }: { read: Promise<DetailRead> }) {
  const { detail, error } = use(read);
  if (!detail) return <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>;
  const now = Date.now();
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: detail.row.title }} />
      {error ? <ErrorNote text={error} /> : null}
      <SessionHeader row={detail.row} now={now} />
      {detail.goal ? <Section title="Goal" body={<Text selectable>{detail.goal}</Text>} /> : null}
      <Section title="Replies" body={<ReplyList replies={detail.replies} now={now} />} />
      <Section title="Output" body={<OutputTail lines={detail.tail} />} />
    </Screen>
  );
}

function Section({ title, body }: { title: string; body: React.ReactNode }) {
  return (
    <View className="gap-2">
      <Text accessibilityRole="header" className="text-sm font-semibold text-muted-foreground">
        {title}
      </Text>
      {body}
    </View>
  );
}
