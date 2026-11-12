import type { DiffLine } from '@mesa/core/phone';
import { Pressable, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { syntaxSpans } from './syntaxSpans';

const BACKGROUND = {
  add: 'bg-state-done/10',
  del: 'bg-destructive/10',
  hunk: 'bg-muted',
  context: 'bg-background',
  meta: 'bg-background',
};
const SIGN = { add: '+', del: '-', context: ' ', hunk: '', meta: '' };
const SPAN = {
  keyword: 'text-state-working',
  string: 'text-state-waiting',
  number: 'text-state-waiting',
  comment: 'text-muted-foreground italic',
};

/** One line of a diff: its old and new numbers, its sign and coloured code; tapped to select it. */
export function DiffLineRow({
  row,
  selected,
  onPress,
}: {
  row: DiffLine;
  selected: boolean;
  onPress: () => void;
}) {
  const code = row.kind === 'add' || row.kind === 'del' || row.kind === 'context';
  return (
    <Pressable
      accessibilityState={{ selected }}
      onPress={onPress}
      className={cn('flex-row px-2', BACKGROUND[row.kind], selected && 'bg-ring/25')}
    >
      <View className="w-20 flex-row">
        <Text className="w-10 text-right font-mono text-xs text-muted-foreground">
          {row.old ?? ''}
        </Text>
        <Text className="w-10 text-right font-mono text-xs text-muted-foreground">
          {row.new ?? ''}
        </Text>
      </View>
      <Text className="flex-1 pl-2 font-mono text-xs">
        <Text className="font-mono text-xs text-muted-foreground">{SIGN[row.kind]}</Text>
        {code ? (
          syntaxSpans(row.text).map((span, at) => (
            <Text
              // biome-ignore lint/suspicious/noArrayIndexKey: a line's spans are a fixed cut of its text.
              key={at}
              className={cn('font-mono text-xs', span.kind && SPAN[span.kind])}
            >
              {span.text}
            </Text>
          ))
        ) : (
          <Text className="font-mono text-xs text-muted-foreground">{row.text}</Text>
        )}
      </Text>
    </Pressable>
  );
}
