import { Redirect, Stack } from 'expo-router';
import { MacScope } from '@/features/mac/MacScope';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/**
 * The Agents tab: every paired Mac's sessions, and one session (or its changes, files, a gate)
 * pushed over it, each screen talking to the Mac its route names (MacScope).
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
      <Stack.Screen name="index" options={{ title: 'Agents', headerLargeTitle: true }} />
      <Stack.Screen name="[id]" options={{ title: '' }} />
    </Stack>
  );
}
