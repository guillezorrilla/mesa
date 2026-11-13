import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { type ReactNode, use } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { PrRow } from './PrRow';
import { groupPrs } from './prGroups';

/** The queue grouped by bucket, most urgent first, under `header`, each PR opening its screen. */
export function PrList({
  answer,
  header,
  refreshing,
  onRefresh,
}: {
  answer: Promise<MacRead<CallResult<'prs'>>>;
  header?: ReactNode;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const { result, error } = use(answer);
  const now = Date.now();
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={groupPrs(result?.prs ?? [])}
      keyExtractor={(pr) => `${pr.project}#${pr.number}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          {header}
          {error || result?.problems.length ? (
            <View className="gap-2 px-4 pb-2">
              {error ? <ErrorNote text={error} /> : null}
              {result?.problems.map((problem) => (
                <Text key={problem} variant="muted">
                  {problem}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      }
      ListEmptyComponent={
        result ? (
          <Text className="px-4 py-8 text-center text-muted-foreground">
            No pull request needs you.
          </Text>
        ) : undefined
      }
      renderSectionHeader={({ section }) => (
        <Text
          accessibilityRole="header"
          className="bg-background px-4 pt-4 pb-1 text-sm font-semibold text-muted-foreground"
        >
          {section.title}
        </Text>
      )}
      renderItem={({ item }) => (
        <PrRow
          pr={item}
          now={now}
          onPress={() =>
            router.push({
              pathname: '/work/pr',
              params: { project: item.project, number: String(item.number) },
            })
          }
        />
      )}
    />
  );
}
