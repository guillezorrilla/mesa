import { type PhoneRun, shortAgo } from '@mesa/core/phone';
import { View } from 'react-native';
import { StateDot } from '@/components/StateDot';
import { Text } from '@/components/ui/text';
import { runColor, runWords } from './runText';

/** What ran, newest first: each run's rule, outcome and why, and when it ended or fired. */
export function RunList({ runs }: { runs: PhoneRun[] }) {
  if (!runs.length) return <Text variant="muted">Nothing has run yet.</Text>;
  const now = Date.now();
  return (
    <View className="gap-1">
      {runs.map((run) => (
        <View
          key={run.id}
          accessible
          accessibilityLabel={`${run.rule}, ${runWords(run.status)}${run.reason ? `, ${run.reason}` : ''}`}
          className="flex-row items-start gap-3 py-2"
        >
          <StateDot color={runColor(run.status)} className="mt-1.5" />
          <View className="flex-1 gap-0.5">
            <Text numberOfLines={1}>{run.rule}</Text>
            <Text variant="muted" numberOfLines={2}>
              {run.reason ? `${runWords(run.status)}: ${run.reason}` : runWords(run.status)}
            </Text>
          </View>
          <Text variant="muted">{shortAgo(run.endedAt ?? run.at, now)}</Text>
        </View>
      ))}
    </View>
  );
}
