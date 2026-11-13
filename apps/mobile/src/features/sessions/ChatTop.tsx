import type { PhoneDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { BusyLine } from '@/components/BusyLine';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { CrewSection } from '../crew/CrewSection';
import { SessionHeader } from './SessionHeader';
import { SessionLinks } from './SessionLinks';

/**
 * The top of a session's conversation, where scrolling up ends: older replies loading, or where
 * the conversation the Mac sends begins; then its state, links, goal and crew.
 */
export function ChatTop({
  detail,
  now,
  loading,
  atMost,
}: {
  detail: PhoneDetail;
  now: number;
  loading: boolean;
  atMost: boolean;
}) {
  return (
    <View className="gap-6 px-4 pt-4 pb-2">
      {loading ? <BusyLine label="Loading older replies..." /> : null}
      {!loading && detail.more && atMost ? (
        <Text variant="muted">Older replies stay on your Mac.</Text>
      ) : null}
      <SessionHeader row={detail.row} now={now} />
      {detail.archived ? (
        <Text variant="muted">Archived on your Mac. Unarchive it from the menu.</Text>
      ) : null}
      <SessionLinks id={detail.row.id} />
      {detail.goal ? (
        <Section title="Goal">
          <Text selectable>{detail.goal}</Text>
        </Section>
      ) : null}
      <CrewSection id={detail.row.id} />
    </View>
  );
}
