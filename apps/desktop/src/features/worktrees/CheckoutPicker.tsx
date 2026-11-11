import { Folder } from 'lucide-react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { cn } from '@/lib/utils';
import { useCheckouts } from './useCheckouts';

const MAIN = 'Main checkout';
const folderOf = (path: string) => path.slice(path.lastIndexOf('/') + 1);

/**
 * The project's checkouts as a native select, '' being the main checkout, each named by its
 * folder (its path when two share a name) and marked while it is stopped in a merge, rebase or
 * cherry-pick. It shows the current one's name beside a folder icon, or the icon alone when
 * `compact`. A selected checkout not listed (not loaded yet, or removed) stays shown by name.
 */
export function CheckoutPicker(props: {
  project: string;
  value: string;
  label: string;
  compact?: boolean;
  onChange: (path: string) => void;
}) {
  const rows = useCheckouts(props.project);
  const linked = rows.filter((row) => !row.main);
  const main = rows.find((row) => row.main);
  const paths = linked.map((row) => row.path);
  if (props.value && !paths.includes(props.value)) paths.push(props.value);
  const shared = (path: string) =>
    paths.filter((each) => folderOf(each) === folderOf(path)).length > 1;
  const choices = [
    { value: '', name: MAIN, operation: main?.operation },
    ...paths.map((path) => ({
      value: path,
      name: shared(path) ? path : folderOf(path),
      operation: linked.find((row) => row.path === path)?.operation,
    })),
  ];
  const options = choices.map((choice) => (
    <NativeSelectOption key={choice.value} value={choice.value}>
      {choice.operation ? `${choice.name} (${choice.operation} in progress)` : choice.name}
    </NativeSelectOption>
  ));
  const select = {
    'aria-label': props.label,
    value: props.value,
    onChange: (event: React.ChangeEvent<HTMLSelectElement>) => props.onChange(event.target.value),
  };
  if (!props.compact)
    return (
      <div className="relative w-56 shrink-0" title={props.value || MAIN}>
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
      title={props.value || MAIN}
    >
      <Folder aria-hidden className="size-4" />
      {/* ponytail: the OS menu of a transparent native select, no custom dropdown. */}
      <select className="absolute inset-0 cursor-pointer opacity-0" {...select}>
        {options}
      </select>
    </span>
  );
}
