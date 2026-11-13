import { useLocalSearchParams } from 'expo-router';
import { TicketScreen } from '@/features/tickets/TicketScreen';

/** One ticket, `/work/ticket?id=jira:HAR-219&project=...`: its id holds a `#` for GitHub's. */
export default function Ticket() {
  const { id, project, site } = useLocalSearchParams<{
    id: string;
    project: string;
    site?: string;
  }>();
  return <TicketScreen id={id} project={project} site={site} />;
}
