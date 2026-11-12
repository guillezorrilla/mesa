import { Pressable } from 'react-native';
import { Text } from '@/components/ui/text';
import { openNote } from './openNote';

/** One line of a receipt stub: a small mono label over a vault path that opens it. */
export function StubLine({ label, path }: { label: string; path: string }) {
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={`Open the ${label.toLowerCase()}, ${path}`}
      onPress={() => openNote(path)}
      className="gap-0.5 active:opacity-70"
    >
      <Text className="font-mono text-xs uppercase tracking-widest text-muted-foreground">
        {label}
      </Text>
      <Text className="font-mono text-sm text-primary underline">{path}</Text>
    </Pressable>
  );
}
