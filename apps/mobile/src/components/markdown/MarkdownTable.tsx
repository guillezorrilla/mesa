import { ScrollView, View } from 'react-native';
import { Text } from '@/components/ui/text';
import { cn } from '@/lib/utils';
import { MarkdownInline } from './MarkdownInline';
import type { Row } from './markdownNodes';

/** A table, scrolled sideways rather than squeezed: every column one width, the header raised. */
// ponytail: one fixed column width; measure columns if wide tables read badly.
export function MarkdownTable({ rows }: { rows: Row[] }) {
  return (
    <ScrollView horizontal>
      <View className="overflow-hidden rounded-lg border border-border">
        {rows.map((row, r) => (
          // biome-ignore lint/suspicious/noArrayIndexKey: a row's place in its table never moves.
          <View key={r} className={cn('flex-row', r > 0 && 'border-t border-border')}>
            {row.children.map((cell, c) => (
              <Text
                // biome-ignore lint/suspicious/noArrayIndexKey: a cell's place in its row never moves.
                key={c}
                selectable
                className={cn(
                  'w-40 px-3 py-2 text-sm',
                  c > 0 && 'border-l border-border',
                  cell.header && 'bg-muted font-semibold',
                )}
              >
                <MarkdownInline nodes={cell.children} />
              </Text>
            ))}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
