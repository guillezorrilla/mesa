import type { PhonePrDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { CheckRow } from './CheckRow';
import { checkColor, checkSummary } from './prText';

/**
 * The head commit's checks on a card edged in their rolled-up state, then Merge, which asks the
 * method and confirms over a failing check. A failing check offers Send to the session working on
 * the branch.
 */
export function ChecksSection({
  pr,
  onSend,
  onMerge,
  busy,
}: {
  pr: PhonePrDetail;
  onSend: () => void;
  onMerge: () => void;
  busy: boolean;
}) {
  const failing = pr.checks === 'failing';
  return (
    <Section title="Checks">
      <View className="overflow-hidden rounded-xl border border-border bg-card">
        <View className={cn('h-1', checkColor(pr.checks))} />
        <Text className="px-4 pt-3 pb-1 font-medium">{checkSummary(pr.checkList)}</Text>
        {pr.checkList.map((check) => (
          <CheckRow key={check.name} check={check} />
        ))}
        <View className="gap-2 p-4">
          {failing && pr.owner ? (
            <Button variant="outline" disabled={busy} onPress={onSend}>
              <Text>Send to the session</Text>
            </Button>
          ) : null}
          {pr.state === 'open' && pr.provider === 'github' ? (
            <Button variant={failing ? 'outline' : 'default'} disabled={busy} onPress={onMerge}>
              <Text className={cn(failing && 'text-destructive')}>Merge...</Text>
            </Button>
          ) : null}
        </View>
      </View>
    </Section>
  );
}
