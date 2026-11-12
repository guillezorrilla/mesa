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
import { useOpenTappedPush } from '@/features/push/useOpenTappedPush';

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

/**
 * Once paired, Agents, the Inbox and Automations; and the Mac: the pairing, usage, the push
 * settings and About. A tapped push opens what it names.
 */
function Tabs() {
  const { pairing } = usePairing();
  useOpenTappedPush();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="agents" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Agents</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray', selected: 'tray.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="automations" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Automations</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="clock.arrow.circlepath" />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Mac</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf="desktopcomputer" />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
