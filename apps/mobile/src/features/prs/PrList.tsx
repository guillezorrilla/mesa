import type { CallResult } from '@mesa/core/phone';
import { router } from 'expo-router';
import { type ReactNode, use } from 'react';
import { RefreshControl, SectionList, View } from 'react-native';
import { CountChips } from '@/components/CountChips';
import { ErrorNote } from '@/components/ErrorNote';
import { GroupHeader } from '@/components/GroupHeader';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { useKept } from '@/lib/useKept';
import type { MacRead } from '../mac/tryCall';
import { PrRow } from './PrRow';
import { ALL_BUCKETS, bucketChoices, groupPrs } from './prGroups';
import { bucketColor } from './prText';

/**
 * The queue grouped by bucket, most urgent first, under `header` and the buckets as counted chips
 * (the picked one kept across visits), each PR opening its screen.
 */
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
  const [kept, setBucket] = useKept('prs.bucket');
  const sections = groupPrs(result?.prs ?? []);
  const choices = bucketChoices(sections);
  // A bucket that emptied since it was picked shows every bucket again.
  const bucket = choices.some((c) => c.value === kept) ? (kept ?? ALL_BUCKETS) : ALL_BUCKETS;
  return (
    <SectionList
      contentInsetAdjustmentBehavior="automatic"
      className="flex-1 bg-background"
      sections={bucket ? sections.filter((s) => s.key === bucket) : sections}
      keyExtractor={(pr) => `${pr.project}#${pr.number}`}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListHeaderComponent={
        <>
          {header}
          {choices.length ? (
            <CountChips label="Status" choices={choices} value={bucket} onChange={setBucket} />
          ) : null}
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
        <GroupHeader
          mark={<StateDot color={bucketColor(section.key)} />}
          title={section.title}
          count={section.data.length}
        />
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
