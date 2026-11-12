import { Redirect, router, Stack } from 'expo-router';
import { usePairing } from '@/features/pairing/usePairing';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Automations tab: the rules and runs, and a new schedule rule pushed over them. */
export default function AutomationsLayout() {
  const { pairing } = usePairing();
  if (!pairing) return <Redirect href="/" />;
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Automations', headerLargeTitle: true }}>
        <Stack.Toolbar placement="right">
          <Stack.Toolbar.Button
            icon="plus"
            accessibilityLabel="New schedule rule"
            onPress={() => router.push('/automations/new')}
          />
        </Stack.Toolbar>
      </Stack.Screen>
      <Stack.Screen name="new" options={{ title: 'New schedule' }} />
    </Stack>
  );
}
