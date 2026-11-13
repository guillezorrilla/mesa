import { Redirect, router, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/**
 * The Agents tab: every session on the Mac, one session pushed over it, starting a new one, and
 * the past conversations to resume.
 */
export default function AgentsLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Agents', headerLargeTitle: true }}>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="clock.arrow.circlepath"
            accessibilityLabel="Past conversations"
            onPress={() => router.push('/agents/history')}
          />
          <Stack.Toolbar.Button
            icon="plus"
            accessibilityLabel="New session"
            onPress={() => router.push('/agents/start')}
          />
        </Stack.Toolbar>
      </Stack.Screen>
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="start" options={{ title: 'New session' }} />
      <Stack.Screen name="history" options={{ title: 'Past conversations' }} />
    </Stack>
  );
}
