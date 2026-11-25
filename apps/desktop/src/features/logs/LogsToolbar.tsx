import type { LogSource } from '@mesa/core';
import { FIXED_SHORTCUTS } from '@mesa/core/browser';
import { Maximize2, Minimize2, Radio, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Input } from '@/components/ui/input';
import { keyCaps } from '@/lib/shortcutKeys';
import { cn } from '@/lib/utils';
import { LogSourcePicker } from './LogSourcePicker';
import { LogsMenu } from './LogsMenu';
import type { LevelFilter } from './logLines';

/** A level filter's label: a dot in its colour, its name, and how many entries it holds. */
function levelLabel(name: string, count: number, dot?: string) {
  return (
    <span className="inline-flex items-center gap-1.5 tabular-nums">
      {dot && <span aria-hidden className={cn('size-1.5 rounded-full', dot)} />}
      {name}
      <span className="text-muted-foreground">{count}</span>
    </span>
  );
}

/**
 * The Logs panel's one header row: the source with its state, All / Errors / Warn, the filter with
 * its request chip, Live, Maximize, the menu and Close. It wraps when the panel is narrow.
 */
export function LogsToolbar(props: {
  sources?: readonly LogSource[];
  source?: string;
  level: LevelFilter;
  counts: Record<LevelFilter, number>;
  text: string;
  request?: string;
  live: boolean;
  maximized: boolean;
  mutes: readonly string[];
  onPick: (id: string) => void;
  onLevel: (level: LevelFilter) => void;
  onText: (text: string) => void;
  onClearRequest: () => void;
  onLive: (live: boolean) => void;
  onMaximize: () => void;
  onRefresh: () => void;
  onAddSource: () => void;
  onMute: (pattern: string) => void;
  onUnmute: (pattern: string) => void;
  onHide: () => void;
  onClose: () => void;
}) {
  const keys = keyCaps(FIXED_SHORTCUTS.maximizeLogs).join('');
  return (
    <header className="flex shrink-0 flex-wrap items-center gap-1.5 border-b bg-card px-2 py-1.5">
      <LogSourcePicker
        sources={props.sources}
        source={props.source}
        onPick={props.onPick}
        onAddSource={props.onAddSource}
        onOpen={props.onRefresh}
      />
      <SegmentedControl<LevelFilter>
        label="Level"
        value={props.level}
        onChange={props.onLevel}
        className="h-7 [&>button]:px-2"
        options={[
          ['all', levelLabel('All', props.counts.all)],
          ['error', levelLabel('Errors', props.counts.error, 'bg-state-failed')],
          ['warn', levelLabel('Warn', props.counts.warn, 'bg-state-waiting')],
        ]}
      />
      <div className="flex h-7 min-w-24 flex-1 items-center gap-1 rounded-md border border-input px-1 focus-within:ring-[3px] focus-within:ring-ring/50">
        {props.request && (
          <span className="inline-flex shrink-0 items-center gap-1 rounded bg-state-working/12 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] text-state-working">
            request {props.request}
            <button
              type="button"
              aria-label="Show every request"
              className="rounded-sm p-0.5 hover:bg-state-working/15"
              onClick={props.onClearRequest}
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        )}
        <Input
          aria-label="Filter lines"
          placeholder="Filter, e.g. /orders"
          className="h-6 min-w-16 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
          value={props.text}
          onChange={(event) => props.onText(event.currentTarget.value)}
        />
      </div>
      <div className="ml-auto flex items-center">
        <IconButton
          label={props.live ? 'Live: new lines every 2 s (pause)' : 'Paused (go live)'}
          icon={Radio}
          active={props.live}
          onClick={() => props.onLive(!props.live)}
        />
        <IconButton
          label={
            props.maximized ? `Back beside the terminal (Esc, ${keys})` : `Maximize logs (${keys})`
          }
          icon={props.maximized ? Minimize2 : Maximize2}
          active={props.maximized}
          onClick={props.onMaximize}
        />
        <LogsMenu
          filter={props.text}
          mutes={props.mutes}
          onRefresh={props.onRefresh}
          onAddSource={props.onAddSource}
          onMute={props.onMute}
          onUnmute={props.onUnmute}
          onHide={props.onHide}
        />
        <IconButton label="Close logs" icon={X} onClick={props.onClose} />
      </div>
    </header>
  );
}
