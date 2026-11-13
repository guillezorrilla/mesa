import { Redirect, Stack } from 'expo-router';
import { MacScope } from '@/features/mac/MacScope';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/**
 * The Agents tab: every paired Mac's sessions, one session (or its changes, files, a gate) pushed
 * over it, starting a new one, and the past conversations to resume, each screen talking to the
 * Mac its route names (MacScope).
 */
export default function AgentsLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack
      screenOptions={{ headerTitleStyle }}
      screenLayout={({ route, children }) => (
        <MacScope params={route.params as { mac?: string; id?: string } | undefined}>
          {children}
        </MacScope>
      )}
    >
      <Stack.Screen name="index" options={{ title: 'Agents', headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
      <Stack.Screen name="start" options={{ title: 'New session' }} />
      <Stack.Screen name="history" options={{ title: 'Past conversations' }} />
    </Stack>
  );
}
