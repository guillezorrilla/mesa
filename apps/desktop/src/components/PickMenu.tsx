import { Check } from 'lucide-react';
import { type ReactElement, useState } from 'react';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { substringFilter } from '@/lib/substringFilter';
import { cn } from '@/lib/utils';

/** One choice in a PickMenu: its value, the name shown and searched, and an optional color dot. */
export type PickItem = { value: string; name: string; color?: string | undefined };

/**
 * A searchable list under `trigger`, each picked choice checked. One pick closes it; with
 * `multiple` it stays open, so several can be ticked in a row.
 */
export function PickMenu(props: {
  trigger: ReactElement;
  label: string;
  search: string;
  empty: string;
  items: PickItem[];
  picked: string[];
  multiple?: boolean;
  /** Open at first: for a menu shown only once its trigger was clicked. */
  defaultOpen?: boolean;
  onPick: (value: string) => void;
}) {
  const [open, setOpen] = useState(props.defaultOpen ?? false);
  return (
    // Modal, so its list scrolls with the wheel inside the dialog that holds it.
    <Popover modal open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{props.trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[max(18rem,var(--radix-popover-trigger-width))] p-0"
        aria-label={props.label}
      >
        <Command filter={substringFilter}>
          <CommandInput placeholder={props.search} />
          <CommandList className="max-h-64">
            <CommandEmpty>{props.empty}</CommandEmpty>
            <CommandGroup>
              {props.items.map((item) => {
                const picked = props.picked.includes(item.value);
                return (
                  <CommandItem
                    key={item.value}
                    value={item.name}
                    aria-checked={picked}
                    onSelect={() => {
                      props.onPick(item.value);
                      if (!props.multiple) setOpen(false);
                    }}
                  >
                    <Check aria-hidden className={cn('text-primary', !picked && 'invisible')} />
                    {item.color !== undefined && (
                      <span
                        aria-hidden
                        className="size-2.5 shrink-0 rounded-full bg-muted-foreground ring-1 ring-foreground/20 ring-inset"
                        style={item.color ? { backgroundColor: item.color } : undefined}
                      />
                    )}
                    <span className="truncate">{item.name}</span>
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
