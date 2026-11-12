import { Linking, Text } from 'react-native';
import { cn } from '@/lib/utils';
import type { Span } from './noteBlocks';
import { openNote } from './openNote';

/**
 * A line's spans inside one Text: a vault link opens its note, a URL opens outside the app.
 * `className` is each span's own, such as a heading's size, which Uniwind does not pass down.
 */
export function NoteSpans({ spans, className }: { spans: Span[]; className?: string }) {
  return spans.map((span, i) => {
    const open = span.path
      ? () => openNote(span.path ?? '')
      : span.url
        ? () => Linking.openURL(span.url ?? '')
        : undefined;
    return (
      <Text
        // biome-ignore lint/suspicious/noArrayIndexKey: a line's spans are a fixed cut of its text.
        key={i}
        onPress={open}
        accessibilityRole={open ? 'link' : undefined}
        className={cn(
          className,
          span.bold && 'font-semibold',
          span.italic && 'italic',
          span.code && 'bg-muted font-mono text-sm',
          open && 'text-primary underline',
          span.broken && 'text-destructive underline decoration-dotted',
        )}
      >
        {span.text}
      </Text>
    );
  });
}
