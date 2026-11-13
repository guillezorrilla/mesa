import { Redirect, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Work tab: pull requests and followed tickets, and one of them pushed over the list. */
export default function WorkLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Work', headerShown: false }} />
      <Stack.Screen name="ticket" options={{ title: '' }} />
      <Stack.Screen name="pr" options={{ title: '' }} />
      <Stack.Screen name="pr-files" options={{ title: 'Files changed' }} />
      <Stack.Screen name="pr-diff" options={{ title: '' }} />
    </Stack>
  );
}
