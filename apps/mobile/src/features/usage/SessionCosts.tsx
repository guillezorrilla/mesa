import type { PhoneSessionUsage } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Fragment } from 'react';
import { Pressable, View } from 'react-native';
import { ContextRing } from '@/components/ContextRing';
import { Separator } from '@/components/ui/separator';
import { Text } from '@/components/ui/text';
import { money } from './usageText';

/** Each session's estimated cost and context use, costliest first; a press opens the session. */
export function SessionCosts({ sessions }: { sessions: PhoneSessionUsage[] }) {
  if (!sessions.length) return <Text variant="muted">No sessions on your Mac.</Text>;
  return (
    <View className="rounded-xl border border-border bg-card">
      {sessions.map((session, index) => (
        <Fragment key={session.id}>
          {index ? <Separator className="ml-4" /> : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${session.title}, ${money(session.cost)}`}
            onPress={() => router.push(`/agents/${session.id}`)}
            className="min-h-16 flex-row items-center gap-3 px-4 py-3 active:bg-accent"
          >
            <View className="flex-1 gap-0.5">
              <Text numberOfLines={1}>{session.title}</Text>
              <Text numberOfLines={1} variant="muted">
                {session.project ?? 'No project'}
              </Text>
            </View>
            <Text className="font-mono">{money(session.cost)}</Text>
            {session.context === null ? (
              <View className="size-11" />
            ) : (
              <ContextRing percent={session.context} />
            )}
          </Pressable>
        </Fragment>
      ))}
    </View>
  );
}
