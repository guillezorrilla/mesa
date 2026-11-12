import { Redirect, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Agents tab: every session on the Mac, and one session pushed over it. */
export default function AgentsLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Agents', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
