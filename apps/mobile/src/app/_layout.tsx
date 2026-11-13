import '@/lib/crypto';
import '@/global.css';
import { PortalHost } from '@rn-primitives/portal';
import { useSegments } from 'expo-router';
import { NativeTabs } from 'expo-router/native-tabs';
import { StatusBar } from 'expo-status-bar';
import { Suspense } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { KeyboardProvider } from 'react-native-keyboard-controller';
import { MacProvider } from '@/features/mac/MacProvider';
import { PairingProvider } from '@/features/pairing/PairingProvider';
import { usePairing } from '@/features/pairing/usePairing';
import { useOpenTappedSession } from '@/features/push/useOpenTappedSession';
import { haptic } from '@/lib/haptics';
import { tabBarHidden } from '@/lib/tabBarHidden';

/** The window: the pairing read from the Keychain before any screen, then the tabs. */
export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <KeyboardProvider>
        <Suspense>
          <PairingProvider>
            <MacProvider>
              <StatusBar style="auto" />
              <Tabs />
              <PortalHost />
            </MacProvider>
          </PairingProvider>
        </Suspense>
      </KeyboardProvider>
    </GestureHandlerRootView>
  );
}

/**
 * Agents, the Inbox, Work (pull requests and tickets) and Usage, once paired, and Settings: the
 * paired Macs, pairing one, the push settings and About; hidden on a session's screen and the new
 * session form, under their bars. A tapped push opens its session; changing tabs gives selection
 * feedback.
 */
function Tabs() {
  const { pairing } = usePairing();
  const segments = useSegments();
  useOpenTappedSession();
  return (
    <NativeTabs
      hidden={tabBarHidden(segments)}
      screenListeners={({ navigation }) => ({
        tabPress: (event) => {
          if (!navigation.isFocused() && !event.data.isPrevented) haptic('selection');
        },
      })}
    >
      <NativeTabs.Trigger name="agents" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Agents</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'square.stack', selected: 'square.stack.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="inbox" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Inbox</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'tray', selected: 'tray.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="work" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Work</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'briefcase', selected: 'briefcase.fill' }} />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="usage" hidden={!pairing}>
        <NativeTabs.Trigger.Label>Usage</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'gauge.with.needle', selected: 'gauge.with.needle.fill' }}
        />
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="(home)">
        <NativeTabs.Trigger.Label>Settings</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon sf={{ default: 'gearshape', selected: 'gearshape.fill' }} />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
