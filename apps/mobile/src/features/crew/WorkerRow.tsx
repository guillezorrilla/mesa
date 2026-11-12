import type { PhoneWorker } from '@mesa/core/phone';
import { router } from 'expo-router';
import { Pressable, View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { stateColor, stateWords } from '../sessions/sessionState';
import { inTurn, reportColor, reportWord } from './crewText';
import { MergeButton } from './MergeButton';

/** One worker: its state, branch and newest report; it opens its session; merge when it has a branch. */
export function WorkerRow({ worker }: { worker: PhoneWorker }) {
  return (
    <View className="gap-3 rounded-xl border border-border p-3">
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${worker.title}, ${stateWords(worker.state)}`}
        onPress={() => router.push(`/agents/${worker.id}`)}
        className="gap-1 active:opacity-70"
      >
        <View className="flex-row items-center gap-2">
          <StateDot color={stateColor(worker.state)} />
          <Text numberOfLines={1} className="flex-1 font-medium">
            {worker.title}
          </Text>
          <Text variant="muted">{stateWords(worker.state)}</Text>
        </View>
        {worker.branch ? (
          <Text numberOfLines={1} className="font-mono text-xs text-muted-foreground">
            {worker.branch}
          </Text>
        ) : null}
        {worker.report ? (
          <Text numberOfLines={3}>
            <Text className={`font-medium ${reportColor(worker.report)}`}>
              {reportWord(worker.report)}
            </Text>{' '}
            {worker.report.message}
          </Text>
        ) : null}
      </Pressable>
      {worker.branch ? (
        <MergeButton
          worker={worker.id}
          branch={worker.branch}
          // Mesa refuses a merge while the worker is in its turn, as the desktop's Merge does.
          inTurn={inTurn(worker.state)}
        />
      ) : null}
    </View>
  );
}
