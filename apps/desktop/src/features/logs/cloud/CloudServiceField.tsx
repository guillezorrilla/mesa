import type { CloudService } from '@mesa/core';
import { ChevronDown } from 'lucide-react';
import { PickMenu } from '@/components/PickMenu';
import { Button } from '@/components/ui/button';
import { useOptional } from '@/lib/useCommand';
import { serviceColor } from './cloudLines';

/** The value standing for every service: picking it clears the others. */
const ALL = '';

/**
 * The Logs tab's service picker: a searchable multi-select of every project's services, each
 * labelled project, kind and name with its colour; none picked is All services.
 */
export function CloudServiceField(props: {
  /** The env whose services of the last hour it lists; the first when none. */
  env?: string;
  picked: readonly string[];
  onChange: (picked: string[]) => void;
}) {
  const read = useOptional('logs.gcpServices', { env: props.env });
  const services: readonly CloudService[] = read.data?.services ?? [];
  const label =
    props.picked.length === 0
      ? 'All services'
      : props.picked.length === 1
        ? (props.picked[0]?.split('/').slice(1).join('/') ?? '')
        : `${props.picked.length} services`;
  const known = services.map((s) => `${s.project}/${s.name}`);
  return (
    <PickMenu
      label="Services"
      search="Search services"
      empty="No service logged in the last hour"
      multiple
      picked={props.picked.length ? [...props.picked] : [ALL]}
      items={[
        { value: ALL, name: 'All services' },
        ...services.map((s) => {
          const value = `${s.project}/${s.name}`;
          return {
            value,
            name: [s.project, s.kind, s.name].filter(Boolean).join(' · '),
            color: serviceColor(value),
          };
        }),
        // A view's service that logged nothing in the last hour still shows, so it can be unpicked.
        ...props.picked
          .filter((value) => !known.includes(value))
          .map((value) => ({ value, name: value.replace('/', ' · '), color: serviceColor(value) })),
      ]}
      onPick={(value) =>
        props.onChange(
          value === ALL
            ? []
            : props.picked.includes(value)
              ? props.picked.filter((each) => each !== value)
              : [...props.picked, value],
        )
      }
      trigger={
        <Button
          variant="outline"
          size="sm"
          aria-label="Services"
          className="max-w-56 justify-between text-xs font-normal"
        >
          <span className="truncate">{label}</span>
          <ChevronDown aria-hidden className="opacity-50" />
        </Button>
      }
    />
  );
}
