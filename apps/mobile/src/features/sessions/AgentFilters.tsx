import { ScrollView, View } from 'react-native';
import { Chip } from '@/components/Chip';
import type { Mac } from '../mac/macsContext';
import type { RowFilter } from './agentRows';

/**
 * One chip per Mac when several are paired, then Unread only and one chip per project; the
 * chosen ones filled; each press changes the filter, with selection feedback.
 */
export function AgentFilters({
  macs,
  projects,
  filter,
  onChange,
}: {
  macs: Pick<Mac, 'id' | 'name'>[];
  projects: string[];
  filter: RowFilter;
  onChange: (filter: RowFilter) => void;
}) {
  const chip = (key: string, label: string, on: boolean, change: Partial<RowFilter>) => (
    <Chip
      key={key}
      label={label}
      selected={on}
      onPress={() => onChange({ ...filter, ...change })}
    />
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
