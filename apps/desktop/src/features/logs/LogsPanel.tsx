import type { LogAsk } from '@mesa/core';
import { entryText, errorGroups, isMuted, logMessage, sourceLabel } from '@mesa/core/browser';
import { ArrowDown, FileText } from 'lucide-react';
import { type ReactNode, useCallback, useMemo, useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { ResizeHandle } from '@/components/ResizeHandle';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useToggleSet } from '@/lib/useToggleSet';
import { cn } from '@/lib/utils';
import { ErrorGroupRow } from './ErrorGroupRow';
import { IntelliJLogsDialog } from './IntelliJLogsDialog';
import { LogEntryRow } from './LogEntryRow';
import { LogsFooter } from './LogsFooter';
import { LogsToolbar } from './LogsToolbar';
import { clockTime, type KeyedEntry, levelCounts, shownEntries } from './logLines';
import { useFollowEnd } from './useFollowEnd';
import { LOGS_WIDTH, TERMINAL_MIN, useLogsLayout } from './useLogsLayout';
import { useMutes } from './useMutes';
import type { LogsActions } from './useSessionLogs';

/** A state in the middle of the list's space: loading, empty, or a failure. */
function Centred(props: { children: ReactNode }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center gap-3 p-6 text-center font-sans">
      {props.children}
    </div>
  );
}

/**
 * A session's Logs panel (CONTEXT.md, Logs panel): its project's local servers' entries under one
 * header row (source, levels, filter, Live, Maximize, menu), Errors grouped, mutes, a request
 * filter; picked entries go to the agent with an ask, or start a session. Beside the terminal it
 * is resizable; maximized it covers the session area (Esc to return).
 */
export function LogsPanel(props: { logs: LogsActions; onClose: () => void }) {
  const { watch } = props.logs;
  const layout = useLogsLayout(watch.project);
  const mutes = useMutes(watch.project);
  const toast = useToast();
  const { clipboard } = usePlatform();
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
  const follow = useFollowEnd(shown);
  const source = watch.sources?.find((each) => each.id === watch.source);
  const pickSource = (id: string) => {
    setPicked(new Set());
    setRequest(undefined);
    watch.pick(id);
  };
  /** Sends `keys`' entries with `asked`, or starts a session with them; true once they went. */
  const askAbout = (asked: LogAsk, keys: ReadonlySet<string>) => {
    const message = logMessage({
      ask: asked,
      source: source ? sourceLabel(source) : (watch.source ?? 'server'),
      entries,
      picked: entries.flatMap((entry, at) => (keys.has(entry.key) ? [at] : [])),
      time: (entry) => clockTime(entry.time),
    });
    if (!props.logs.takesPrompt) {
      props.logs.start(message);
      return true;
    }
    return props.logs.send(message);
  };
  // Stable, so a poll re-renders only the rows that changed: the latest actions, through a ref.
  const latest = useRef({ askAbout, mute: mutes.add, toast, clipboard });
  latest.current = { askAbout, mute: mutes.add, toast, clipboard };
  const onToggle = useCallback(
    (key: string) =>
      setPicked((now) => {
        const next = new Set(now);
        if (!next.delete(key)) next.add(key);
        return next;
      }),
    [setPicked],
  );
  const onMute = useCallback((pattern: string) => latest.current.mute(pattern), []);
  const onCopy = useCallback((entry: KeyedEntry) => {
    const { clipboard, toast } = latest.current;
    void clipboard
      .write(entryText(entry, clockTime(entry.time)))
      .then(() => toast('Copied the line', 'confirmation'));
  }, []);
  const onSendOne = useCallback(
    (key: string) => void latest.current.askAbout({ kind: 'send' }, new Set([key])),
    [],
  );
  const actions = {
    onToggle,
    onRequest: setRequest,
    onMute,
    onCopy,
    onSendOne,
    sendLabel: props.logs.takesPrompt ? 'Send to agent' : 'Start a session with this line',
  };
  const { maximized } = layout;
  return (
    <aside
      aria-label="Logs"
      data-maximized={maximized || undefined}
      style={maximized ? undefined : { width: layout.width }}
      className={cn(
        '@container flex h-full min-h-0 flex-col border-l bg-card',
        maximized ? 'absolute inset-0 z-20 border-l-0' : 'relative max-w-full shrink-0',
      )}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && maximized && !event.defaultPrevented)
          layout.setMaximized(false);
      }}
    >
      {!maximized && (
        <ResizeHandle
          label="Resize logs panel"
          edge="left"
          width={layout.width}
          bounds={LOGS_WIDTH}
          keep={TERMINAL_MIN}
          onWidth={layout.resize}
        />
      )}
      <LogsToolbar
        sources={watch.sources}
        source={watch.source}
        level={watch.level}
        counts={levelCounts(visible)}
        text={text}
        request={request}
        live={watch.live}
        maximized={maximized}
        mutes={mutes.mutes}
        onPick={pickSource}
        onLevel={watch.setLevel}
        onText={setText}
        onClearRequest={() => setRequest(undefined)}
        onLive={watch.setLive}
        onMaximize={layout.toggle}
        onRefresh={() => void watch.refreshSources()}
        onIntelliJ={() => setIntellij(true)}
        onMute={onMute}
        onUnmute={mutes.remove}
        onHide={props.logs.hide}
        onClose={props.onClose}
      />
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
            <Centred>
              <p role="alert" className="max-w-md text-xs text-state-failed">
                {watch.failure}
              </p>
            </Centred>
          ) : watch.sources?.length === 0 ? (
            <Centred>
              <Muted className="max-w-sm">
                No running containers or server sessions for this project. Start the server with
                Docker or in a Mesa terminal session, or show IntelliJ logs.
              </Muted>
              <Button size="sm" variant="outline" onClick={() => setIntellij(true)}>
                <FileText aria-hidden /> Show IntelliJ logs
              </Button>
            </Centred>
          ) : !watch.entries ? (
            <Centred>
              <Muted>{watch.source ? 'Reading' : 'Looking for sources'}</Muted>
            </Centred>
          ) : !shown.length ? (
            <Centred>
              <Muted>
                {entries.length ? 'No lines match this filter.' : 'Nothing logged yet.'}
              </Muted>
            </Centred>
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
      {picked.size > 0 && (
        <LogsFooter
          picked={picked.size}
          takesPrompt={props.logs.takesPrompt}
          onAsk={(asked) => askAbout(asked, picked) && setPicked(new Set())}
          onClear={() => setPicked(new Set())}
        />
      )}
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
