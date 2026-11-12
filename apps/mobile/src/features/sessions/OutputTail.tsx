import { ScrollView } from 'react-native';
import { Text } from '@/components/ui/text';

/** The last lines of the session's output log, as its terminal printed them. */
export function OutputTail({ lines }: { lines: string[] }) {
  if (!lines.length) return <Text variant="muted">No output yet.</Text>;
  return (
    <ScrollView horizontal className="rounded-lg bg-muted" contentContainerClassName="p-3">
      <Text selectable className="font-mono text-xs leading-5">
        {lines.join('\n')}
      </Text>
    </ScrollView>
  );
}
