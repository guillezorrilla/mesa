import '@/lib/crypto';
import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { NativeTabs } from 'expo-router/native-tabs';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { MacProvider } from '@/features/mac/MacProvider';
import { PairingProvider } from '@/features/pairing/PairingProvider';
import { usePairing } from '@/features/pairing/usePairing';

/** The window: the pairing read from the Keychain before any screen, then the tabs. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <Suspense>
        <PairingProvider>
          <MacProvider>
            <StatusBar style="auto" />
            <Tabs />
            <PortalHost />
          </MacProvider>
        </PairingProvider>
      </Suspense>
    </GestureHandlerRootView>
  );
}

/** Agents, once paired, and the Mac: the pairing and About. */
function Tabs() {
  const { pairing } = usePairing();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="agents" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Agents</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Mac</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="desktopcomputer" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
