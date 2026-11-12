import { ScrollView } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { RowFilter } from './agentRows';

/** Unread only, then one chip per project; the chosen ones filled. */
export function AgentFilters({
  projects,
  filter,
  onChange,
}: {
  projects: string[];
  filter: RowFilter;
  onChange: (filter: RowFilter) => void;
}) {
  const chip = (label: string, on: boolean, change: Partial<RowFilter>) => (
    <Button
      key={label}
      size="sm"
      variant={on ? 'default' : 'secondary'}
      accessibilityState={{ selected: on }}
      onPress={() => onChange({ ...filter, ...change })}
    >
      <Text>{label}</Text>
    </Button>
  );
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerClassName="gap-2 px-4 py-2"
    >
      {chip('Unread', filter.unreadOnly, { unreadOnly: !filter.unreadOnly })}
      {projects.map((project) =>
        chip(project, filter.project === project, {
          project: filter.project === project ? undefined : project,
        }),
      )}
    </ScrollView>
  );
}
