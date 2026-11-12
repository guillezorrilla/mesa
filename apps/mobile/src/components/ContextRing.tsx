import { View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';
import { Text } from '@/components/ui/text';

const SIZE = 44;
const STROKE = 4;
const RADIUS = (SIZE - STROKE) / 2;
const LENGTH = 2 * Math.PI * RADIUS;

/** How full a context window is: a ring filled to `percent`, the number inside it. */
export function ContextRing({ percent }: { percent: number }) {
  const track = useCSSVariable('--color-muted') as string;
  const fill = useCSSVariable(percent >= 80 ? '--color-destructive' : '--color-primary') as string;
  const filled = Math.min(100, Math.max(0, percent)) / 100;
  return (
    <View
      accessible
      accessibilityLabel={`Context ${percent}% used`}
      className="size-11 items-center justify-center"
    >
      <Svg
        width={SIZE}
        height={SIZE}
        style={{ position: 'absolute', transform: [{ rotate: '-90deg' }] }}
      >
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={track}
          strokeWidth={STROKE}
          fill="none"
        />
        <Circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={RADIUS}
          stroke={fill}
          strokeWidth={STROKE}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={`${LENGTH * filled} ${LENGTH}`}
        />
      </Svg>
      <Text className="font-mono text-xs">{percent}</Text>
    </View>
  );
}
