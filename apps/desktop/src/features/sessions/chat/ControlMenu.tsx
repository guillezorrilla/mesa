import type { ControlChoice } from '@mesa/core/browser';
import { Check, Loader2 } from 'lucide-react';
import type { KeyboardEvent, ReactNode } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

/**
 * A footer control's menu, as Claude Desktop's model and mode pickers: a quiet trigger that spins
 * while its change waits on the agent, a menu above it whose number keys pick the numbered choices
 * (`numbered`), and the keys back in the composer when it closes (`onReturnFocus`).
 */
export function ControlMenu(props: {
  label: string;
  trigger: ReactNode;
  busy: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  numbered: ControlChoice[];
  onPick: (choice: ControlChoice) => void;
  onReturnFocus?: () => void;
  className?: string;
  children: ReactNode;
}) {
  const byNumber = (event: KeyboardEvent) => {
    const at = /^[1-9]$/.test(event.key) ? Number(event.key) - 1 : -1;
    const choice = props.numbered[at];
    if (!choice || event.metaKey || event.ctrlKey || event.altKey) return;
    event.preventDefault();
    props.onOpenChange?.(false);
    props.onPick(choice);
  };
  return (
    <DropdownMenu open={props.open} onOpenChange={props.onOpenChange}>
      <DropdownMenuTrigger asChild disabled={props.busy}>
        <Button
          variant="ghost"
          size="sm"
          aria-label={props.label}
          aria-busy={props.busy}
          className="h-7 gap-1.5 px-2 text-xs"
        >
          {props.trigger}
          {props.busy && (
            <Loader2 aria-hidden className="size-3 animate-spin motion-reduce:animate-none" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="top"
        align="end"
        sideOffset={8}
        className={cn('rounded-xl p-1.5', props.className)}
        onKeyDown={byNumber}
        onCloseAutoFocus={(event) => {
          if (!props.onReturnFocus) return;
          event.preventDefault();
          props.onReturnFocus();
        }}
      >
        {props.children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One choice: its name with a Default badge, what it does beneath, a check when it is the current
 * one, and its number key.
 */
export function ControlMenuItem(props: {
  choice: ControlChoice;
  checked: boolean;
  isDefault?: boolean;
  number?: number;
  onSelect: () => void;
}) {
  const { choice } = props;
  return (
    <DropdownMenuItem
      role="menuitemradio"
      aria-checked={props.checked}
      className="items-start gap-3 rounded-lg px-2.5 py-2"
      onSelect={props.onSelect}
    >
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex items-center gap-2">
          {choice.label}
          {props.isDefault && (
            <Badge variant="secondary" className="h-5 rounded-md px-1.5 font-normal text-[11px]">
              Default
            </Badge>
          )}
        </span>
        {choice.description && (
          <span className="text-muted-foreground text-xs">{choice.description}</span>
        )}
      </span>
      <Check
        aria-hidden
        className={cn('mt-0.5 size-4 shrink-0 text-primary', !props.checked && 'invisible')}
      />
      {props.number !== undefined && (
        <span className="mt-0.5 w-3 text-right text-muted-foreground text-xs tabular-nums">
          {props.number}
        </span>
      )}
    </DropdownMenuItem>
  );
}
