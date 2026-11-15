import type { PhoneTicket } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { ticketDetail } from './ticketText';

/** One ticket under its status's heading: its key, summary, whose it is and its live sessions. */
export function TicketRow({ ticket, onPress }: { ticket: PhoneTicket; onPress: () => void }) {
  const detail = ticketDetail(ticket);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${ticket.key}, ${ticket.summary}, ${ticket.status}, ${detail}`}
      onPress={onPress}
      className="min-h-14 gap-0.5 bg-background py-2.5 pr-4 pl-10 active:bg-accent"
    >
      <Text numberOfLines={2}>{ticket.summary}</Text>
      <View className="flex-row items-center gap-2">
        <Text className="font-mono text-xs text-muted-foreground">{ticket.key}</Text>
        {ticket.sessions.length ? (
          <View className="size-1.5 rounded-full bg-state-working" />
        ) : null}
        <Text numberOfLines={1} className="flex-1 text-xs text-muted-foreground">
          {detail}
        </Text>
      </View>
    </Pressable>
  );
}
