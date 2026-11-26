import type { LogAsk } from '@mesa/core';
import { errorGroups, isMuted, logMessage, sourceLabel } from '@mesa/core/browser';
import { useMemo, useState } from 'react';
import { ResizeHandle } from '@/components/ResizeHandle';
import { useKept } from '@/lib/keptValue';
import { pressed } from '@/lib/shortcutKeys';
import { useToggleSet } from '@/lib/useToggleSet';
import { cn } from '@/lib/utils';
import { clockTime, levelCounts, shownEntries } from '../shared/logLines';
import { useCopy } from '../shared/useCopy';
import { AddLogSourceDialog } from './AddLogSourceDialog';
import { LogFilters } from './LogFilters';
import { LogList } from './LogList';
import { LogSourcePicker } from './LogSourcePicker';
import { LogsFooter } from './LogsFooter';
import { LogsLayoutButtons } from './LogsLayoutButtons';
import { LogsMenu } from './LogsMenu';
import { LogsToolbar } from './LogsToolbar';
import { LOGS_WIDTH, TERMINAL_MIN, useLogsLayout } from './useLogsLayout';
import { useMutes } from './useMutes';
import { useRowActions } from './useRowActions';
import type { LogsActions } from './useSessionLogs';

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
  // The text filter is kept per project too, so it is there after a restart.
  const [keptText, keepText] = useKept(watch.project && `mesa.logs.text.${watch.project}`);
  const text = keptText ?? '';
  const setText = (next: string) => keepText(next || undefined);
  const [request, setRequest] = useState<string>();
  const [picked, , setPicked] = useToggleSet();
  const [openGroups, toggleGroup] = useToggleSet();
  const [addingSource, setAddingSource] = useState(false);
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
  const { copy, copyGroup } = useCopy(source ? sourceLabel(source) : (watch.source ?? 'server'));
  const actions = useRowActions({
    takesPrompt: props.logs.takesPrompt,
    setPicked,
    setRequest,
    mute: mutes.add,
    askAbout,
    copy,
    copyGroup,
  });
  /** The picked entries, in the stream's order. */
  const pickedEntries = () => entries.filter((entry) => picked.has(entry.key));
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
        // Mod+C copies the picked lines, unless the person selected text to copy themselves.
        const typing = (event.target as HTMLElement).closest('input, textarea');
        if (
          pressed(event, 'Mod+C') &&
          picked.size &&
          !typing &&
          !window.getSelection()?.toString()
        ) {
          event.preventDefault();
          copy(pickedEntries(), 'paste');
        }
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
        source={
          <LogSourcePicker
            sources={watch.sources}
            source={watch.source}
            onPick={pickSource}
            onAddSource={() => setAddingSource(true)}
            onOpen={() => void watch.refreshSources()}
          />
        }
        filters={
          <LogFilters
            level={watch.level}
            counts={levelCounts(visible)}
            text={text}
            request={request}
            onLevel={watch.setLevel}
            onText={setText}
            onClearRequest={() => setRequest(undefined)}
          />
        }
        layout={
          <LogsLayoutButtons
            live={watch.live}
            maximized={maximized}
            onLive={watch.setLive}
            onMaximize={layout.toggle}
          />
        }
        menu={
          <LogsMenu
            filter={text}
            mutes={mutes.mutes}
            onRefresh={() => void watch.refreshSources()}
            onAddSource={() => setAddingSource(true)}
            onMute={actions.onMute}
            onUnmute={mutes.remove}
            onHide={props.logs.hide}
          />
        }
        onClose={props.onClose}
      />
      <LogList
        watch={watch}
        shown={shown}
        groups={groups}
        picked={picked}
        openGroups={openGroups}
        onOpenGroup={toggleGroup}
        actions={actions}
        onAddSource={() => setAddingSource(true)}
      />
      {picked.size > 0 && (
        <LogsFooter
          picked={picked.size}
          takesPrompt={props.logs.takesPrompt}
          onAsk={(asked) => askAbout(asked, picked) && setPicked(new Set())}
          onCopy={(format) => copy(pickedEntries(), format)}
          onClear={() => setPicked(new Set())}
        />
      )}
      {addingSource && watch.project && (
        <AddLogSourceDialog
          project={watch.project}
          onFound={(id) => {
            setAddingSource(false);
            // Listed first, so the new source is picked rather than passed over as unknown.
            void watch.refreshSources().then(() => pickSource(id));
          }}
          onClose={() => setAddingSource(false)}
        />
      )}
    </aside>
  );
}
