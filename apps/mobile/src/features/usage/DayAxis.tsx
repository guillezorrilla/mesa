import { View } from 'react-native';
import { Text } from '@/components/ui/text';

/** How wide the axis column beside the bars is, in points. */
export const AXIS_WIDTH = 44;

/**
 * The scale's labels, top, middle and zero, beside the bars' gridlines on the right, as Apple
 * Health puts them. Hidden from VoiceOver, which reads each bar's cost.
 */
export function DayAxis({ labels }: { labels: string[] }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className="h-32 justify-between pl-2"
      style={{ width: AXIS_WIDTH }}
    >
      {labels.map((label) => (
        <Text key={label} className="font-mono text-[10px] text-muted-foreground">
          {label}
        </Text>
      ))}
    </View>
  );
}
