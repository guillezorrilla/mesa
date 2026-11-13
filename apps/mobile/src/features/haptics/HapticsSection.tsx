import { Switch, View } from 'react-native';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import { useHapticsOn } from '@/lib/haptics';

/** The phone's Haptics setting: on unless the person turns it off, kept on this phone. */
export function HapticsSection() {
  const [on, setOn] = useHapticsOn();
  return (
    <Section title="Haptics">
      <View className="flex-row items-center gap-3 rounded-xl border border-border bg-card p-4">
        <View className="flex-1 gap-0.5">
          <Text className="font-medium">Haptic feedback</Text>
          <Text variant="muted">
            A tap when pairing, a reply, an answer, a start or a merge lands or fails, and when you
            change tabs or choices.
          </Text>
        </View>
        <Switch value={on} accessibilityLabel="Haptic feedback" onValueChange={setOn} />
      </View>
    </Section>
  );
}
