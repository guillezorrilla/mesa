import { Redirect, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Vault tab: the projects and search, a project, a note, today's digest, and saving a decision. */
export default function VaultLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Vault', headerLargeTitle: true }} />
      <Stack.Screen name="project/[name]" options={{ title: '' }} />
      <Stack.Screen name="note" options={{ title: '' }} />
      <Stack.Screen name="today" options={{ title: 'Today' }} />
      <Stack.Screen name="decide" options={{ title: 'Save a decision' }} />
    </Stack>
  );
}
