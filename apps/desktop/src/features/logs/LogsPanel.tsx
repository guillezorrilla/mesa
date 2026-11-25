import {
  EyeOff,
  FileText,
  MoreHorizontal,
  RefreshCw,
  ScrollText,
  SendHorizontal,
  X,
} from 'lucide-react';
import { useLayoutEffect, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { useToggleSet } from '@/lib/useToggleSet';
import { cn } from '@/lib/utils';
import { IntelliJLogsDialog } from './IntelliJLogsDialog';
import { LogEntryRow } from './LogEntryRow';
import { type LevelFilter, levelCounts, logPrompt, shownEntries, sourceLabel } from './logLines';
import type { LogWatch } from './useLogWatch';

/** The picker's last item, which opens the IntelliJ setup rather than picking a source. */
const INTELLIJ = '#intellij';
/** Within this many pixels of the end, the list counts as scrolled to it and follows new entries. */
const AT_END_PX = 40;

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
 * A session's Logs panel (CONTEXT.md, Logs panel): its project's local servers' entries, level
 * coloured, with a source picker, All / Errors / Warn, a text filter and Live. Clicked entries are
 * selected; Send to agent puts them, with the source's name, in the session's prompt field.
 */
export function LogsPanel(props: {
  watch: LogWatch;
  /** Puts text in the session's prompt field; none for a session with no agent to send to. */
  onSend?: (text: string) => boolean;
  onHide: () => void;
  onClose: () => void;
}) {
  const { watch } = props;
  const [text, setText] = useState('');
  const [picked, toggle, setPicked] = useToggleSet();
  const [intellij, setIntellij] = useState(false);
  /** The session showed no prompt field for the last Send: the lines stay selected. */
  const [unsent, setUnsent] = useState(false);
  const list = useRef<HTMLDivElement>(null);
  const atEnd = useRef(true);
  const entries = watch.entries ?? [];
  const shown = shownEntries(entries, watch.level, text);
  const counts = levelCounts(entries);
  const source = watch.sources?.find((each) => each.id === watch.source);
  useLayoutEffect(() => {
    const box = list.current;
    if (box && atEnd.current && shown.length) box.scrollTop = box.scrollHeight;
  });
  const pickSource = (id: string) => {
    if (id === INTELLIJ) return setIntellij(true);
    setPicked(new Set());
    watch.pick(id);
  };
  const send = () => {
    const sent = props.onSend?.(
      logPrompt(
        source ? sourceLabel(source) : (watch.source ?? 'server'),
        entries.filter((entry) => picked.has(entry.key)),
      ),
    );
    setUnsent(!sent);
    if (sent) setPicked(new Set());
  };
  const noSources = watch.sources?.length === 0;
  const status = !props.onSend
    ? 'A terminal session has no agent to send lines to'
    : !picked.size
      ? 'Click lines to select them'
      : unsent
        ? 'This session takes no prompt now; start or resume it first'
        : `${picked.size} ${picked.size === 1 ? 'line' : 'lines'} selected`;
  return (
    <aside
      aria-label="Logs"
      className="flex h-full w-[30rem] min-h-0 shrink-0 flex-col border-l bg-card"
    >
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <ScrollText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Logs</span>
        <NativeSelect
          aria-label="Log source"
          size="sm"
          className="ml-auto max-w-60 text-xs"
          value={watch.source ?? ''}
          onChange={(event) => pickSource(event.currentTarget.value)}
          onFocus={() => void watch.refreshSources()}
        >
          {!watch.source && <NativeSelectOption value="">No source</NativeSelectOption>}
          {watch.source && !source && (
            <NativeSelectOption value={watch.source}>{watch.source}</NativeSelectOption>
          )}
          {watch.sources?.map((each) => (
            <NativeSelectOption key={each.id} value={each.id}>
              {sourceLabel(each)}
            </NativeSelectOption>
          ))}
          <NativeSelectOption value={INTELLIJ}>Show IntelliJ logs...</NativeSelectOption>
        </NativeSelect>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <IconButton label="Logs menu" icon={MoreHorizontal} />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void watch.refreshSources()}>
              <RefreshCw aria-hidden /> Look for sources again
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setIntellij(true)}>
              <FileText aria-hidden /> Show IntelliJ logs
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={props.onHide}>
              <EyeOff aria-hidden /> Hide Logs for this project
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <IconButton label="Close logs" icon={X} onClick={props.onClose} />
      </header>
      <div className="flex shrink-0 flex-wrap items-center gap-2 border-b px-3 py-2">
        <SegmentedControl<LevelFilter>
          label="Level"
          value={watch.level}
          onChange={watch.setLevel}
          options={[
            ['all', levelLabel('All', counts.all)],
            ['error', levelLabel('Errors', counts.error, 'bg-state-failed')],
            ['warn', levelLabel('Warn', counts.warn, 'bg-state-waiting')],
          ]}
        />
        <Input
          aria-label="Filter lines"
          placeholder="Filter, e.g. /orders"
          className="h-7 min-w-24 flex-1 text-xs"
          value={text}
          onChange={(event) => setText(event.currentTarget.value)}
        />
        <Label className="gap-1.5 text-xs font-normal text-muted-foreground">
          <Switch checked={watch.live} onCheckedChange={watch.setLive} /> Live
        </Label>
      </div>
      <div
        ref={list}
        role="listbox"
        aria-label="Log lines"
        aria-multiselectable
        className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[11.5px] leading-5"
        onScroll={(event) => {
          const box = event.currentTarget;
          atEnd.current = box.scrollHeight - box.scrollTop - box.clientHeight < AT_END_PX;
        }}
      >
        {noSources ? (
          <div className="grid gap-3 px-3 py-4 font-sans">
            <Muted>
              No running containers or server sessions for this project. Start the server with
              Docker or in a Mesa terminal session, or show IntelliJ logs.
            </Muted>
            <Button
              size="sm"
              variant="outline"
              className="justify-self-start"
              onClick={() => setIntellij(true)}
            >
              <FileText aria-hidden /> Show IntelliJ logs
            </Button>
          </div>
        ) : watch.failure ? (
          <p role="alert" className="px-3 py-4 font-sans text-xs text-state-failed">
            {watch.failure}
          </p>
        ) : !watch.entries ? (
          <Muted className="px-3 py-4 font-sans">
            {watch.source ? 'Reading' : 'Looking for sources'}
          </Muted>
        ) : !shown.length ? (
          <Muted className="px-3 py-4 font-sans">
            {entries.length ? 'No lines match this filter.' : 'Nothing logged yet.'}
          </Muted>
        ) : (
          shown.map((entry) => (
            <LogEntryRow
              key={entry.key}
              entry={entry}
              selected={picked.has(entry.key)}
              onToggle={() => toggle(entry.key)}
            />
          ))
        )}
      </div>
      <footer className="flex min-h-11 shrink-0 items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground">
        <span className="mr-auto" role="status">
          {status}
        </span>
        <Button
          size="sm"
          variant="outline"
          disabled={!picked.size}
          onClick={() => setPicked(new Set())}
        >
          Clear
        </Button>
        <Button size="sm" disabled={!picked.size || !props.onSend} onClick={send}>
          <SendHorizontal aria-hidden /> Send to agent
        </Button>
      </footer>
      {intellij && watch.project && (
        <IntelliJLogsDialog
          project={watch.project}
          onFound={(id) => {
            setIntellij(false);
            void watch.refreshSources();
            pickSource(id);
          }}
          onClose={() => setIntellij(false)}
        />
      )}
    </aside>
  );
}
