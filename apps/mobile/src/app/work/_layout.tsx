import { Redirect, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Work tab: a project's followed tickets, and one ticket pushed over them. */
export default function WorkLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Work', headerLargeTitle: true }} />
      <Stack.Screen name="ticket" options={{ title: '' }} />
    </Stack>
  );
}
