import '@/lib/crypto';
import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { router, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { PairingProvider } from '@/features/pairing/PairingProvider';

/** The window: the pairing read from the Keychain before any screen, then the stack. */
export default function RootLayout() {
  return (
    <Suspense>
      <PairingProvider>
        <StatusBar style="auto" />
        <Stack
          screenOptions={{ headerTitleStyle: { fontFamily: 'IBM Plex Sans', fontWeight: '600' } }}
        >
          <Stack.Screen name="index" options={{ title: 'Mesa' }}>
            {/* A native bar button, so iOS 26 centers the symbol in its glass circle. */}
            <Stack.Toolbar placement="right">
              <Stack.Toolbar.Button
                icon="info.circle"
                accessibilityLabel="About Mesa"
                onPress={() => router.push('/about')}
              />
            </Stack.Toolbar>
          </Stack.Screen>
          <Stack.Screen name="pair" options={{ title: 'Pair' }} />
          <Stack.Screen name="about" options={{ title: 'About' }} />
        </Stack>
        <PortalHost />
      </PairingProvider>
    </Suspense>
  );
}
