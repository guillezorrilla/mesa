import { View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';

/** How wide the axis column beside the bars is, in points. */
export const AXIS_WIDTH = 44;
/** How tall the plot is, from the zero gridline to the top one: the bars and the axis share it. */
export const PLOT_HEIGHT = 'h-32';

/**
 * The scale's labels, top, middle and zero, beside the bars' gridlines on the right, as Apple
 * Health puts them. Hidden from VoiceOver, which reads each bar's cost.
 */
export function DayAxis({ labels }: { labels: string[] }) {
  return (
    <View
      importantForAccessibility="no-hide-descendants"
      accessibilityElementsHidden
      className={cn(PLOT_HEIGHT, 'justify-between pl-2')}
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
