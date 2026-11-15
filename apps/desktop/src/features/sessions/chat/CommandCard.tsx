import type { Config } from '@mesa/core';
import { Loader2, SquareTerminal } from 'lucide-react';
import { AnsiLines } from '@/components/AnsiLines';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

/** The keys a live card presses, as tmux names them, and their caps. */
const KEYS = [
  ['Escape', 'Esc'],
  ['Up', '↑'],
  ['Down', '↓'],
  ['Left', '←'],
  ['Right', '→'],
  ['Tab', 'Tab'],
  ['Enter', 'Enter'],
] as const;

/**
 * A slash command in the chat: the command, then what it showed, the transcript's output or else
 * its panel's last frame, in terminal colours. A `live` one, just sent, spins until a frame comes and
 * has keys to drive the agent's panel, and Open in terminal for anything more.
 */
export function CommandCard(props: {
  command: string;
  frame?: readonly string[];
  output?: string;
  error?: boolean;
  live?: boolean;
  /** The profile's terminal colours, which the card draws in. */
  terminal?: Config['terminal'];
  onKey: (key: string) => void;
  onOpenTerminal: () => void;
}) {
  // The transcript's output is exact; a frame is read off the screen, so it is for what has none.
  const lines = props.output ? props.output.split('\n') : props.frame;
  return (
    <div
      className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3"
      data-testid="command-card"
    >
      <div className="flex items-center gap-2">
        <code className="font-mono text-sm">{props.command}</code>
        {props.live && !lines && (
          <Loader2
            aria-label="Waiting for its panel"
            className="size-3.5 animate-spin text-muted-foreground"
          />
        )}
      </div>
      {lines ? (
        <AnsiLines
          lines={lines}
          terminal={props.terminal}
          className={cn(props.error && 'ring-1 ring-destructive')}
        />
      ) : (
        !props.live && <Muted size="xs">No output</Muted>
      )}
      {props.live && (
        <div className="flex flex-wrap items-center gap-1">
          {KEYS.map(([key, cap]) => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="h-7 min-w-8 px-2 font-mono text-xs"
              aria-label={`Press ${key}`}
              onClick={() => props.onKey(key)}
            >
              {cap}
            </Button>
          ))}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7"
            onClick={props.onOpenTerminal}
          >
            <SquareTerminal aria-hidden /> Open in terminal
          </Button>
        </div>
      )}
    </div>
  );
}
