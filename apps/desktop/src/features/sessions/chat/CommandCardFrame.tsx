import type { Config } from '@mesa/core';
import { X } from 'lucide-react';
import { type KeyboardEvent, type ReactNode, useState } from 'react';
import { AnsiLines } from '@/components/AnsiLines';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** A command's text as it printed it, colours kept: a plain row's body, and a card's raw view. */
export function CommandOutput(props: {
  output?: string;
  error?: boolean;
  terminal?: Config['terminal'];
}) {
  return props.output ? (
    <AnsiLines
      lines={props.output.split('\n')}
      terminal={props.terminal}
      className={cn(props.error && 'ring-1 ring-destructive')}
    />
  ) : (
    <Muted size="xs">No output</Muted>
  );
}

/**
 * Up and Down move between a card's controls (`data-card-control`); a list that moves by itself
 * (it prevents the key) and a select keep their own arrows.
 */
function moveFocus(event: KeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || (event.key !== 'ArrowDown' && event.key !== 'ArrowUp')) return;
  if (event.target instanceof HTMLSelectElement) return;
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('[data-card-control]')];
  const at = controls.indexOf(event.target as HTMLElement);
  const next = controls[at + (event.key === 'ArrowDown' ? 1 : -1)];
  if (!next) return;
  event.preventDefault();
  next.focus();
}

/**
 * A slash command's card in Structured chat (#1218): the command, what it is, and its body, with
 * its raw text one click away. Escape closes it to one line and gives the keys back to the
 * composer (`onClose`); closed, it opens again on a click.
 */
export function CommandCardFrame(props: {
  command: string;
  title: string;
  open: boolean;
  onOpen: () => void;
  onClose: () => void;
  raw: { output?: string; error?: boolean; terminal?: Config['terminal'] };
  children: ReactNode;
}) {
  const [raw, setRaw] = useState(false);
  if (!props.open)
    return (
      <div className="flex w-full items-center gap-2 rounded-lg border bg-card px-3 py-2">
        <code className="font-mono text-sm">{props.command}</code>
        <Muted size="xs" className="flex-1">
          {props.title}
        </Muted>
        <Button size="sm" variant="ghost" onClick={props.onOpen}>
          Open
        </Button>
      </div>
    );
  return (
    <section
      aria-label={`${props.command} card`}
      data-testid="command-card"
      className="flex w-full flex-col gap-3 rounded-lg border bg-card p-3"
      onKeyDown={(event) => {
        if (event.key === 'Escape') {
          event.preventDefault();
          props.onClose();
        } else moveFocus(event);
      }}
    >
      <header className="flex items-center gap-2">
        <code className="font-mono text-sm">{props.command}</code>
        <span className="flex-1 font-medium text-sm">{props.title}</span>
        <Button
          size="sm"
          variant="ghost"
          aria-pressed={raw}
          className="h-7 text-xs"
          onClick={() => setRaw((shown) => !shown)}
        >
          {raw ? 'Hide raw' : 'Show raw'}
        </Button>
        <IconButton label={`Close ${props.command}`} icon={X} onClick={props.onClose} />
      </header>
      {raw ? <CommandOutput {...props.raw} /> : props.children}
    </section>
  );
}
