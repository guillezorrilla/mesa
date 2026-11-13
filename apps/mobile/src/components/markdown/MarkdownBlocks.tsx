import { View } from 'react-native';
import { CodeBlock } from '@/components/CodeBlock';
import { Text } from '@/components/ui/text';
import { MarkdownDetails } from './MarkdownDetails';
import { MarkdownInline } from './MarkdownInline';
import { MarkdownList } from './MarkdownList';
import { MarkdownTable } from './MarkdownTable';
import type { Block } from './markdownNodes';

const HEADING = ['text-xl', 'text-lg', 'text-base'];

/** A document's blocks top to bottom, each drawn with Mesa's tokens. */
export function MarkdownBlocks({ blocks }: { blocks: Block[] }) {
  return (
    <View className="gap-3">
      {blocks.map((block, at) => {
        // A block's place in its document never moves: the index is its key.
        const key = at;
        switch (block.type) {
          case 'paragraph':
            return (
              <Text key={key} selectable className="leading-6">
                <MarkdownInline nodes={block.children} />
              </Text>
            );
          case 'heading':
            return (
              <Text
                key={key}
                selectable
                accessibilityRole="header"
                className={`${HEADING[Math.min(block.depth, 3) - 1]} font-semibold`}
              >
                <MarkdownInline nodes={block.children} />
              </Text>
            );
          case 'code':
            return <CodeBlock key={key} code={block.value} />;
          case 'quote':
            return (
              <View key={key} className="border-l-2 border-border pl-3">
                <MarkdownBlocks blocks={block.children} />
              </View>
            );
          case 'list':
            return (
              <MarkdownList
                key={key}
                items={block.children}
                ordered={block.ordered}
                start={block.start}
                renderItem={(item) => <MarkdownBlocks blocks={item.children} />}
              />
            );
          case 'table':
            return <MarkdownTable key={key} rows={block.children} />;
          case 'details':
            return (
              <MarkdownDetails key={key} summary={block.summary} open={block.open}>
                <MarkdownBlocks blocks={block.children} />
              </MarkdownDetails>
            );
          default: // a rule
            return <View key={key} className="h-px bg-border" />;
        }
      })}
    </View>
  );
}
