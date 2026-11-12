import { Redirect, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Tickets tab: a project's followed tickets, and one ticket pushed over them. */
export default function TicketsLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Tickets', headerLargeTitle: true }} />
      <Stack.Screen name="ticket" options={{ title: '' }} />
    </Stack>
  );
}
