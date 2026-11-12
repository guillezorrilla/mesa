import { View } from 'react-native';
import { CodeBlock } from '@/components/CodeBlock';
import { Text } from '@/components/ui/text';
import { NoteSpans } from './NoteSpans';
import type { Block } from './noteBlocks';

const HEADINGS = ['text-2xl', 'text-xl', 'text-lg', 'text-base', 'text-base', 'text-base'];

/** One block of a note, drawn natively: a heading, paragraph, list item, quote, code or rule. */
export function NoteBlock({ block }: { block: Block }) {
  if (block.kind === 'rule') return <View className="my-1 h-px bg-border" />;
  if (block.kind === 'code') return <CodeBlock code={block.text} />;
  if (block.kind === 'heading')
    return (
      <Text selectable accessibilityRole="header" className="mt-2 font-semibold tracking-tight">
        <NoteSpans spans={block.spans} className={HEADINGS[block.level - 1]} />
      </Text>
    );
  if (block.kind === 'quote')
    return (
      <View className="border-l-2 border-border pl-3">
        <Text selectable className="leading-6 text-muted-foreground italic">
          <NoteSpans spans={block.spans} />
        </Text>
      </View>
    );
  if (block.kind === 'item')
    return (
      <View className="flex-row gap-2" style={{ paddingLeft: block.depth * 16 }}>
        <Text className="min-w-4 font-mono text-muted-foreground">{block.marker}</Text>
        <Text selectable className="flex-1 leading-6">
          <NoteSpans spans={block.spans} />
        </Text>
      </View>
    );
  return (
    <Text selectable className="leading-6">
      <NoteSpans spans={block.spans} />
    </Text>
  );
}
