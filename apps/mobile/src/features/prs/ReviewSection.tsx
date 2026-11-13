import type { PhonePrDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { reviewText } from './reviewText';

/** Where my review stands in one sentence, and Start review, or Open the review session. */
export function ReviewSection({ pr, onReview }: { pr: PhonePrDetail; onReview: () => void }) {
  const { say, action } = reviewText(pr);
  return (
    <Section title="Review">
      <View className="gap-3 rounded-xl border border-border bg-card p-4">
        <Text>{say}</Text>
        {pr.state === 'open' ? (
          <Button variant="outline" onPress={onReview}>
            <Text>{action}</Text>
          </Button>
        ) : null}
      </View>
    </Section>
  );
}
