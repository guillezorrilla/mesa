import type { PhoneTicketDetail } from '@mesa/core/phone';
import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { assigneesText } from './ticketText';

/** A ticket's key and status, its summary, and who it is with. */
export function TicketHeading({ ticket }: { ticket: PhoneTicketDetail }) {
  return (
    <View className="gap-2">
      <Text variant="muted" className="font-mono text-xs">
        {ticket.key} · {ticket.status}
      </Text>
      <Text selectable accessibilityRole="header" className="text-2xl font-semibold">
        {ticket.summary}
      </Text>
      <Text variant="muted">{assigneesText(ticket)}</Text>
    </View>
  );
}
