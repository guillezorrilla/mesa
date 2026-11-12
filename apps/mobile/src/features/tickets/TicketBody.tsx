import { router, Stack } from 'expo-router';
import Play from 'lucide-react-native/icons/play';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { AssignButton } from './AssignButton';
import { TicketComments } from './TicketComments';
import { TicketHeading } from './TicketHeading';
import { ticketTitle } from './ticketText';
import type { TicketRead } from './useTicket';

/** A ticket: what it is, Start a session from it, Assign to me, its description and comments. */
export function TicketBody({
  read,
  project,
  site,
}: {
  read: Promise<TicketRead>;
  project: string;
  site?: string;
}) {
  const { ticket, error } = use(read);
  return (
    <Screen className="gap-6">
      <Stack.Screen options={{ title: ticket?.key ?? 'Ticket' }} />
      {error ? <ErrorNote text={error} /> : null}
      {ticket ? (
        <>
          <TicketHeading ticket={ticket} />
          <Button
            className="rounded-full"
            onPress={() =>
              router.push({
                pathname: '/agents/start',
                params: { project, from: ticket.id, title: ticketTitle(ticket) },
              })
            }
          >
            <Icon as={Play} className="size-4 text-primary-foreground" />
            <Text>Start a session</Text>
          </Button>
          {ticket.mine ? null : <AssignButton id={ticket.id} site={site} />}
          <Section title="Description">
            <Text selectable>{ticket.description || 'No description.'}</Text>
          </Section>
          <TicketComments comments={ticket.comments} />
        </>
      ) : null}
    </Screen>
  );
}
