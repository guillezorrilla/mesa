import { Fragment } from 'react';
import { Linking, Text } from 'react-native';
import type { Inline } from './markdownNodes';

const PAD = '\u00a0';

/** Runs of text inside one native Text, each span taking its block's size and colour: code in
 *  mono on a muted ground, links underlined and opened in the browser, as Mesa's desktop draws them. */
export function MarkdownInline({ nodes }: { nodes: Inline[] }) {
  return nodes.map((node, at) => (
    // biome-ignore lint/suspicious/noArrayIndexKey: a run's place in its block never moves.
    <Fragment key={at}>{drawn(node)}</Fragment>
  ));
}

function drawn(node: Inline) {
  switch (node.type) {
    case 'text':
      return node.value;
    case 'code':
      return (
        <Text className="bg-muted font-mono">
          {PAD}
          {node.value}
          {PAD}
        </Text>
      );
    case 'strong':
      return (
        <Text className="font-semibold">
          <MarkdownInline nodes={node.children} />
        </Text>
      );
    case 'em':
      return (
        <Text className="italic">
          <MarkdownInline nodes={node.children} />
        </Text>
      );
    case 'del':
      return (
        <Text className="line-through">
          <MarkdownInline nodes={node.children} />
        </Text>
      );
    default: // a link
      return (
        <Text
          accessibilityRole="link"
          className="underline"
          onPress={() => void Linking.openURL(node.href)}
        >
          <MarkdownInline nodes={node.children} />
        </Text>
      );
  }
}
