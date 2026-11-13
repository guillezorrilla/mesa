import { Stack } from 'expo-router';
import { headerTitleStyle } from '@/lib/headerStyle';

/** The Settings tab: the paired Macs (or pairing the first), pairing another, and About. */
export default function HomeLayout() {
  return (
    <Stack screenOptions={{ headerTitleStyle }}>
      <Stack.Screen name="index" options={{ title: 'Settings', headerShown: false }} />
      <Stack.Screen name="pair" options={{ title: 'Pair a Mac' }} />
      <Stack.Screen name="about" options={{ title: 'About' }} />
    </Stack>
  );
}
