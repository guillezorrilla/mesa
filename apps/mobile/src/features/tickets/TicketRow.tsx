import type { PhoneTicket } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ticketDetail } from './ticketText';

/** One ticket in a list: its key, summary, status, whose it is and its live sessions. */
export function TicketRow({ ticket, onPress }: { ticket: PhoneTicket; onPress: () => void }) {
  const detail = ticketDetail(ticket);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ticket.key}, ${ticket.summary}, ${detail}`}
      onPress={onPress}
      className="min-h-16 gap-0.5 bg-background px-4 py-3 active:bg-accent"
    >
      <View className="flex-row items-baseline gap-2">
        <Text className="font-mono text-xs text-muted-foreground">{ticket.key}</Text>
        {ticket.sessions.length ? (
          <View className="size-1.5 rounded-full bg-state-working" />
        ) : null}
      </View>
      <Text numberOfLines={2}>{ticket.summary}</Text>
      <Text numberOfLines={1} variant="muted">
        {detail}
      </Text>
    </Pressable>
  );
}
