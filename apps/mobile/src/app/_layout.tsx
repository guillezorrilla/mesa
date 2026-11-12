import '@/lib/crypto';
import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { Link, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import Info from 'lucide-react-native/icons/info';
import { Suspense } from 'react';
import { Icon } from '@/components/ui/icon';
import { PairingProvider } from '@/features/pairing/PairingProvider';

/** The window: the pairing read from the Keychain before any screen, then the stack. */
export default function RootLayout() {
  return (
    <Suspense>
      <PairingProvider>
        <StatusBar style="auto" />
        <Stack>
          <Stack.Screen
            name="index"
            options={{
              title: 'Mesa',
              headerRight: () => (
                <Link href="/about" accessibilityLabel="About Mesa">
                  <Icon as={Info} className="size-5 text-foreground" />
                </Link>
              ),
            }}
          />
          <Stack.Screen name="pair" options={{ title: 'Pair' }} />
          <Stack.Screen name="about" options={{ title: 'About' }} />
        </Stack>
        <PortalHost />
      </PairingProvider>
    </Suspense>
  );
}
