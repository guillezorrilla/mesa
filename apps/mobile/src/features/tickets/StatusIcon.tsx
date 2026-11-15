import Svg, { Circle, Path } from 'react-native-svg';
import { useCSSVariable } from 'uniwind';

/**
 * A ticket's status category as a small icon, as the Mac app draws it: a dashed ring to do, a
 * half-filled ring in progress, a filled check done. Decoration: the words beside it say the status.
 */
export function StatusIcon({ category }: { category: string }) {
  const done = useCSSVariable('--color-state-done') as string;
  const doing = useCSSVariable('--color-state-waiting') as string;
  const todo = useCSSVariable('--color-muted-foreground') as string;
  return (
    <Svg width={14} height={14} viewBox="0 0 14 14" accessible={false}>
      {category === 'done' ? (
        <>
          <Circle cx={7} cy={7} r={6} fill={done} />
          <Path d="m4.5 7 1.8 1.8 3.4-3.6" fill="none" stroke="white" strokeWidth={1.5} />
        </>
      ) : category === 'indeterminate' ? (
        <>
          <Circle cx={7} cy={7} r={5.5} fill="none" stroke={doing} strokeWidth={1.5} />
          <Path d="M7 3.5a3.5 3.5 0 0 1 0 7z" fill={doing} />
        </>
      ) : (
        <Circle
          cx={7}
          cy={7}
          r={5.5}
          fill="none"
          stroke={todo}
          strokeWidth={1.5}
          strokeDasharray="2 2"
        />
      )}
    </Svg>
  );
}
