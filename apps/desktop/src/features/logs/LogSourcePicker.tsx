import type { LogSource } from '@mesa/core';
import { sourceLabel, timeAgo } from '@mesa/core/browser';
import { ChevronDown, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';

const DOT = {
  live: 'bg-state-done',
  quiet: 'bg-muted-foreground/40',
  stopped: 'border border-muted-foreground/60 bg-transparent',
};

/** A source's state in words: live, or when it printed last, and stopped when its container exited. */
export function sourceState(source: LogSource, now = Date.now()) {
  if (source.state === 'live') return 'live';
  const last = source.lastLine ? `last line ${timeAgo(source.lastLine, now)}` : 'no lines yet';
  return source.state === 'stopped' ? `stopped, ${last}` : last;
}

function StateDot(props: { source?: LogSource }) {
  return (
    <span
      aria-hidden
      data-state={props.source?.state}
      className={cn('size-2 shrink-0 rounded-full', DOT[props.source?.state ?? 'quiet'])}
    />
  );
}

/**
 * The Logs panel's source picker: each source as kind and name with a dot for its state (live,
 * quiet, stopped) and when it printed last, then Show IntelliJ logs. Opening it looks for sources again.
 */
export function LogSourcePicker(props: {
  sources?: readonly LogSource[];
  source?: string;
  onPick: (id: string) => void;
  onIntelliJ: () => void;
  onOpen: () => void;
}) {
  const current = props.sources?.find((each) => each.id === props.source);
  return (
    <DropdownMenu onOpenChange={(open) => open && props.onOpen()}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Log source"
          title={current ? sourceState(current) : undefined}
          className="ml-auto h-7 min-w-0 max-w-72 gap-1.5 px-2 text-xs font-normal"
        >
          <StateDot source={current} />
          <span className="truncate">
            {current ? sourceLabel(current) : (props.source ?? 'No source')}
          </span>
          <ChevronDown aria-hidden className="size-3.5 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {props.sources?.map((each) => (
          <DropdownMenuItem
            key={each.id}
            data-source={each.id}
            onSelect={() => props.onPick(each.id)}
            className={cn(each.id === props.source && 'bg-accent/60')}
          >
            <StateDot source={each} />
            <span className="min-w-0 flex-1 truncate">{sourceLabel(each)}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{sourceState(each)}</span>
          </DropdownMenuItem>
        ))}
        {props.sources?.length ? <DropdownMenuSeparator /> : null}
        <DropdownMenuItem onSelect={props.onIntelliJ}>
          <FileText aria-hidden /> Show IntelliJ logs...
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
