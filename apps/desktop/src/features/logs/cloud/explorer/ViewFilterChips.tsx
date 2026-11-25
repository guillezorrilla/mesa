import { FilterChip } from '@/components/FilterChip';
import type { CloudFilters } from '@/lib/client/logs';

/**
 * The filters a saved view or an older link holds beside the query (severity, text, fields, a
 * trace, a metric), each a chip whose remove takes it off.
 */
export function ViewFilterChips(props: {
  filters: CloudFilters;
  onFilters: (filters: CloudFilters) => void;
}) {
  const { filters } = props;
  const without = (next: Partial<CloudFilters>) => props.onFilters({ ...filters, ...next });
  const fields = Object.entries(filters.fields ?? {});
  const chips = [
    ...(filters.severity
      ? [{ label: `severity >= ${filters.severity}`, off: () => without({ severity: undefined }) }]
      : []),
    ...(filters.text
      ? [{ label: `text "${filters.text}"`, off: () => without({ text: undefined }) }]
      : []),
    ...fields.map(([key, value]) => ({
      label: `${key} = ${value}`,
      off: () => {
        const rest = Object.fromEntries(fields.filter(([k]) => k !== key));
        without({ fields: Object.keys(rest).length ? rest : undefined });
      },
    })),
    ...(filters.trace
      ? [{ label: `trace ${filters.trace.slice(0, 12)}`, off: () => without({ trace: undefined }) }]
      : []),
    ...(filters.metric
      ? [{ label: `metric ${filters.metric}`, off: () => without({ metric: undefined }) }]
      : []),
  ];
  if (!chips.length) return null;
  return (
    <fieldset aria-label="View filters" className="flex flex-wrap items-center gap-1.5">
      {chips.map((chip) => (
        <FilterChip key={chip.label} removeLabel={`Remove ${chip.label}`} onRemove={chip.off}>
          {chip.label}
        </FilterChip>
      ))}
    </fieldset>
  );
}
