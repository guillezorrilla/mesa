import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import { type AnswerOutcome, outcomeText } from './promptText';

/** How the last answer went: a failure in the alert colour, the rest muted. */
export function AnswerNote({ outcome }: { outcome: AnswerOutcome }) {
  if ('error' in outcome) return <ErrorNote text={outcome.error} />;
  return (
    <Text accessibilityLiveRegion="polite" variant="muted">
      {outcomeText(outcome)}
    </Text>
  );
}
