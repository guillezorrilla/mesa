import { router, Stack } from 'expo-router';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Mac tab: the paired Macs, pairing another (or from a link), usage, and About. */
export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
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
      <Stack.Screen name="pair" options={{ title: 'Pair a Mac' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
      <Stack.Screen name="usage" options={{ title: 'Usage', headerLargeTitle: true }} />
    </Stack>
  );
}
