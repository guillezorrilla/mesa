import { ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import type { RowFilter } from './agentRows';

/**
 * One chip per Mac when several are paired, then Unread only and one chip per project; the
 * chosen ones filled.
 */
export function AgentFilters({
  macs,
  projects,
  filter,
  onChange,
}: {
  macs: { id: string; name: string }[];
  projects: string[];
  filter: RowFilter;
  onChange: (filter: RowFilter) => void;
}) {
  const chip = (key: string, label: string, on: boolean, change: Partial<RowFilter>) => (
    <Button
      key={key}
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
      contentContainerClassName="items-center gap-2 px-4 py-2"
    >
      {macs.length > 1 ? (
        <>
          {macs.map((mac) =>
            chip(`mac:${mac.id}`, mac.name, filter.mac === mac.id, {
              mac: filter.mac === mac.id ? undefined : mac.id,
            }),
          )}
          <View className="mx-1 h-5 w-px bg-border" />
        </>
      ) : null}
      {chip('unread', 'Unread', filter.unreadOnly, { unreadOnly: !filter.unreadOnly })}
      {projects.map((project) =>
        chip(`project:${project}`, project, filter.project === project, {
          project: filter.project === project ? undefined : project,
        }),
      )}
    </ScrollView>
  );
}
