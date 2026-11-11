import { Folder } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { useCheckouts } from './useCheckouts';

/**
 * The project's checkouts as a native select, '' being the main checkout, each named by its
 * folder and marked while it is stopped in a merge, rebase or cherry-pick. It shows the current
 * one's name beside a folder icon, or the icon alone when `compact`.
 */
export function CheckoutPicker(props: {
  project: string;
  value: string;
  label: string;
  compact?: boolean;
  onChange: (path: string) => void;
}) {
  const checkouts = useCheckouts(props.project);
  const options = checkouts.map((row) => {
    const value = row.main ? '' : row.path;
    const name = row.main ? 'Main checkout' : row.path.slice(row.path.lastIndexOf('/') + 1);
    return (
      <NativeSelectOption key={row.path} value={value}>
        {row.operation ? `${name} (${row.operation} in progress)` : name}
      </NativeSelectOption>
    );
  });
  // Before the list loads, the main checkout is still the one to show.
  if (!checkouts.some((row) => row.main))
    options.unshift(
      <NativeSelectOption key="" value="">
        Main checkout
      </NativeSelectOption>,
    );
  const select = {
    'aria-label': props.label,
    value: props.value,
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value),
  };
  if (!props.compact)
    return (
      <div className="relative w-56 shrink-0" title={props.value || 'Main checkout'}>
        <Folder
          aria-hidden
          className={cn(
            'pointer-events-none absolute top-1/2 left-2.5 z-10 size-4 -translate-y-1/2',
            props.value ? 'text-state-working' : 'text-muted-foreground',
          )}
        />
        <NativeSelect size="sm" className="bg-background pl-8 dark:bg-background" {...select}>
          {options}
        </NativeSelect>
      </div>
    );
  return (
    <span
      className={cn(
        'relative flex size-8 items-center justify-center rounded-md hover:bg-accent focus-within:outline-2 focus-within:outline-ring',
        props.value ? 'text-state-working' : 'text-muted-foreground hover:text-foreground',
      )}
      title={props.value || 'Main checkout'}
    >
      <Folder aria-hidden className="size-4" />
      {/* ponytail: the OS menu of a transparent native select, no custom dropdown. */}
      <select className="absolute inset-0 cursor-pointer opacity-0" {...select}>
        {options}
      </select>
    </span>
  );
}
