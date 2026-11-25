import type { LogAsk } from '@mesa/core';
import { errorGroups, isMuted, logMessage, sourceLabel } from '@mesa/core/browser';
import { ArrowDown, FileText, ScrollText, X } from 'lucide-react';
import { useCallback, useMemo, useRef, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { ResizeHandle } from '@/components/ResizeHandle';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { useKeptWidth } from '@/lib/useKeptWidth';
import { useToggleSet } from '@/lib/useToggleSet';
import { cn } from '@/lib/utils';
import { ErrorGroupRow } from './ErrorGroupRow';
import { IntelliJLogsDialog } from './IntelliJLogsDialog';
import { LogEntryRow } from './LogEntryRow';
import { LogSourcePicker } from './LogSourcePicker';
import { LogsFooter } from './LogsFooter';
import { LogsMenu } from './LogsMenu';
import { clockTime, type LevelFilter, levelCounts, shownEntries } from './logLines';
import { useFollowEnd } from './useFollowEnd';
import { useMutes } from './useMutes';
import type { LogsActions } from './useSessionLogs';

/** The panel's width bounds beside the terminal, which always keeps TERMINAL_MIN pixels. */
const LOGS_WIDTH = { min: 360, max: 1400, initial: 560, step: 32 };
const TERMINAL_MIN = 256;

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
 * coloured, with a source picker, All / Errors (grouped) / Warn, a text filter, a request filter,
 * mutes and Live. Picked entries go to the agent with an ask, or start a session.
 */
export function LogsPanel(props: { logs: LogsActions; onClose: () => void }) {
  const { watch } = props.logs;
  const [width, resize] = useKeptWidth('mesa.logs.width', LOGS_WIDTH);
  const mutes = useMutes(watch.project);
  const [text, setText] = useState('');
  const [request, setRequest] = useState<string>();
  const [picked, , setPicked] = useToggleSet();
  const [openGroups, toggleGroup] = useToggleSet();
  const [intellij, setIntellij] = useState(false);
  const entries = watch.entries ?? [];
  const visible = useMemo(
    () => entries.filter((entry) => !isMuted(entry, mutes.mutes)),
    [entries, mutes.mutes],
  );
  const shown = useMemo(
    () => shownEntries(visible, { level: watch.level, text, request }),
    [visible, watch.level, text, request],
  );
  const groups = useMemo(
    () => (watch.level === 'error' ? errorGroups(shown) : undefined),
    [watch.level, shown],
  );
  const counts = levelCounts(visible);
  const follow = useFollowEnd(shown);
  const source = watch.sources?.find((each) => each.id === watch.source);
  const onToggle = useCallback(
    (key: string) =>
      setPicked((now) => {
        const next = new Set(now);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [setPicked],
  );
  // Stable, so a poll re-renders only the rows that changed: the latest mutes, through a ref.
  const mute = useRef(mutes.add);
  mute.current = mutes.add;
  const onMute = useCallback((pattern: string) => mute.current(pattern), []);
  const pickSource = (id: string) => {
    setPicked(new Set());
    setRequest(undefined);
    watch.pick(id);
  };
  const ask = (asked: LogAsk) => {
    const message = logMessage({
      ask: asked,
      source: source ? sourceLabel(source) : (watch.source ?? 'server'),
      entries,
      picked: entries.flatMap((entry, at) => (picked.has(entry.key) ? [at] : [])),
      time: (entry) => clockTime(entry.time),
    });
    if (!props.logs.takesPrompt) props.logs.start(message);
    else if (props.logs.send(message)) setPicked(new Set());
  };
  const actions = { onToggle, onRequest: setRequest, onMute };
  return (
    <aside
      aria-label="Logs"
      style={{ width }}
      className="@container relative flex h-full min-h-0 max-w-full shrink-0 flex-col border-l bg-card"
    >
      <ResizeHandle
        label="Resize logs panel"
        edge="left"
        width={width}
        bounds={LOGS_WIDTH}
        keep={TERMINAL_MIN}
        onWidth={resize}
      />
      <header className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
        <ScrollText aria-hidden className="size-4 shrink-0 text-muted-foreground" />
        <span className="text-sm font-medium">Logs</span>
        <LogSourcePicker
          sources={watch.sources}
          source={watch.source}
          onPick={pickSource}
          onIntelliJ={() => setIntellij(true)}
          onOpen={() => void watch.refreshSources()}
        />
        <LogsMenu
          filter={text}
          mutes={mutes.mutes}
          onRefresh={() => void watch.refreshSources()}
          onIntelliJ={() => setIntellij(true)}
          onMute={onMute}
          onUnmute={mutes.remove}
          onHide={props.logs.hide}
        />
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
        <div className="flex h-7 min-w-32 flex-1 items-center gap-1 rounded-md border border-input px-1 focus-within:ring-[3px] focus-within:ring-ring/50">
          {request && (
            <span className="inline-flex shrink-0 items-center gap-1 rounded bg-state-working/12 py-0.5 pr-0.5 pl-1.5 font-mono text-[11px] text-state-working">
              request {request}
              <button
                type="button"
                aria-label="Show every request"
                className="rounded-sm p-0.5 hover:bg-state-working/15"
                onClick={() => setRequest(undefined)}
              >
                <X aria-hidden className="size-3" />
              </button>
            </span>
          )}
          <Input
            aria-label="Filter lines"
            placeholder="Filter, e.g. /orders"
            className="h-6 min-w-16 flex-1 border-0 px-1 text-xs shadow-none focus-visible:ring-0 dark:bg-transparent"
            value={text}
            onChange={(event) => setText(event.currentTarget.value)}
          />
        </div>
        <Label className="gap-1.5 text-xs font-normal text-muted-foreground">
          <Switch checked={watch.live} onCheckedChange={watch.setLive} /> Live
        </Label>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-col">
        <div
          ref={follow.ref}
          role="listbox"
          aria-label="Log lines"
          aria-multiselectable
          className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[11.5px] leading-5"
          onScroll={follow.onScroll}
        >
          {watch.failure ? (
            <p role="alert" className="px-3 py-4 font-sans text-xs text-state-failed">
              {watch.failure}
            </p>
          ) : watch.sources?.length === 0 ? (
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
          ) : !watch.entries ? (
            <Muted className="px-3 py-4 font-sans">
              {watch.source ? 'Reading' : 'Looking for sources'}
            </Muted>
          ) : !shown.length ? (
            <Muted className="px-3 py-4 font-sans">
              {entries.length ? 'No lines match this filter.' : 'Nothing logged yet.'}
            </Muted>
          ) : groups ? (
            groups.map((group) => (
              <ErrorGroupRow
                key={group.key}
                group={group}
                open={openGroups.has(group.key)}
                onOpen={toggleGroup}
                picked={picked}
                {...actions}
              />
            ))
          ) : (
            shown.map((entry) => (
              <LogEntryRow
                key={entry.key}
                entry={entry}
                selected={picked.has(entry.key)}
                {...actions}
              />
            ))
          )}
        </div>
        {watch.live && follow.newCount > 0 && (
          <Button
            size="sm"
            className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 rounded-full px-3 text-xs shadow-md"
            onClick={follow.jump}
          >
            <ArrowDown aria-hidden /> {follow.newCount} new
          </Button>
        )}
      </div>
      <LogsFooter
        picked={picked.size}
        takesPrompt={props.logs.takesPrompt}
        onAsk={ask}
        onClear={() => setPicked(new Set())}
      />
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
