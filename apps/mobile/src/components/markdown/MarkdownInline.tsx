import { Fragment } from 'react';
import { Linking, Text } from 'react-native';
import type { Inline } from './markdownNodes';

const PAD = '\u00a0';

/** Runs of text inside one native Text, each span taking its block's size and colour: code in
 *  mono on a muted ground, links underlined and opened in the browser, as Mesa's desktop draws them. */
export function MarkdownInline({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, at) => {
    // A run's place in its block never moves: the index is its key.
    const key = at;
    switch (node.type) {
      case 'text':
        return <Fragment key={key}>{node.value}</Fragment>;
      case 'code':
        return (
          <Text key={key} className="bg-muted font-mono">
            {PAD}
            {node.value}
            {PAD}
          </Text>
        );
      case 'strong':
        return (
          <Text key={key} className="font-semibold">
            <MarkdownInline nodes={node.children} />
          </Text>
        );
      case 'em':
        return (
          <Text key={key} className="italic">
            <MarkdownInline nodes={node.children} />
          </Text>
        );
      case 'del':
        return (
          <Text key={key} className="line-through">
            <MarkdownInline nodes={node.children} />
          </Text>
        );
      default: // a link
        return (
          <Text
            key={key}
            accessibilityRole="link"
            className="underline"
            onPress={() => void Linking.openURL(node.href)}
          >
            <MarkdownInline nodes={node.children} />
          </Text>
        );
    }
  });
}
