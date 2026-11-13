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
/** A changed line's rule down its left edge; a selected line's is the ring colour. */
const RULE = {
  add: 'border-state-done',
  del: 'border-destructive',
  hunk: 'border-transparent',
  context: 'border-transparent',
  meta: 'border-transparent',
};
const SIGN = { add: '+', del: '-', context: ' ', hunk: '', meta: '' };
const SPAN = {
  keyword: 'text-state-working',
  string: 'text-state-waiting',
  number: 'text-state-waiting',
  comment: 'text-muted-foreground italic',
};

/** One line of a diff: its old and new numbers, its sign and coloured code; tapped to select it, when it can be. */
export function DiffLineRow({
  row,
  selected,
  onPress,
}: {
  row: DiffLine;
  selected: boolean;
  onPress?: () => void;
}) {
  const code = row.kind === 'add' || row.kind === 'del' || row.kind === 'context';
  return (
    <Pressable
      accessibilityState={{ selected }}
      disabled={!onPress}
      onPress={onPress}
      className={cn(
        'flex-row border-l-2 pr-2',
        BACKGROUND[row.kind],
        RULE[row.kind],
        selected && 'border-ring bg-ring/20',
      )}
    >
      <View className="w-20 flex-row border-r border-border">
        <Text className="w-10 text-right font-mono text-xs text-muted-foreground">
          {row.old ?? ''}
        </Text>
        <Text className="w-10 text-right font-mono text-xs text-muted-foreground">
          {row.new ?? ''}
        </Text>
      </View>
      <Text className={cn('flex-1 py-px pl-2 font-mono text-xs', row.kind === 'hunk' && 'py-1')}>
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
