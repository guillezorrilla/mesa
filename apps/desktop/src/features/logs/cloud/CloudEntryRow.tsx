import type { CloudLogEntry } from '@mesa/core';
import { cloudLevel, entryConsoleUrl, splitMessage } from '@mesa/core/browser';
import { ChevronDown, Eye, EyeOff, MessageSquareText, Wrench } from 'lucide-react';
import { memo } from 'react';
import { IconButton } from '@/components/IconButton';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CopyButton } from '../shared/CopyButton';
import { LevelBadge } from '../shared/LevelBadge';
import { LogRow } from '../shared/LogRow';
import { clockTime } from '../shared/logLines';
import { MessageBody } from '../shared/MessageBody';
import type { EntryActions } from './types';

/**
 * One Cloud Logs entry on the shared LogRow (CONTEXT.md, Cloud Logs): its time, level, service and
 * message with its stack folded; its context fields a click from the query; opened, its whole
 * payload. A cited entry is marked. On hover: Show and Hide matching, Ask Claude, Fix in session,
 * Copy (with its Cloud Console link) and open.
 */
export const CloudEntryRow = memo(function CloudEntryRow(props: {
  entry: CloudLogEntry;
  selected: boolean;
  cited: boolean;
  expanded: boolean;
  onExpand: () => void;
  actions: EntryActions;
}) {
  const { entry, actions } = props;
  const { head, stack } = splitMessage(entry.message);
  const act = (run: () => void) => (event: { stopPropagation: () => void }) => {
    event.stopPropagation();
    run();
  };
  return (
    <div
      data-id={entry.id}
      data-cited={props.cited || undefined}
      className={cn(props.cited && 'bg-state-working/[0.07]')}
    >
      <LogRow
        level={cloudLevel(entry.severity)}
        selected={props.selected}
        onSelect={() => actions.onSelect(entry)}
        time={clockTime(entry.time)}
        badge={<LevelBadge level={cloudLevel(entry.severity)} />}
        logger={entry.service}
        actions={
          <>
            <IconButton
              label="Show matching"
              icon={Eye}
              onClick={act(() => actions.onShow(entry))}
            />
            <IconButton
              label="Hide matching"
              icon={EyeOff}
              onClick={act(() => actions.onHide(entry))}
            />
            <IconButton
              label="Ask Claude"
              icon={MessageSquareText}
              onClick={act(() => actions.onAsk(entry))}
            />
            <IconButton
              label="Fix in session"
              icon={Wrench}
              onClick={act(() => actions.onFix(entry))}
            />
            {/* biome-ignore lint/a11y/noStaticElementInteractions: keeps the row's click off the menu */}
            <span
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <CopyButton
                onCopy={(format) => actions.onCopy(entry, format)}
                extra={
                  <DropdownMenuItem
                    onSelect={() => actions.onCopyText(entryConsoleUrl(entry), 'the link')}
                  >
                    Link to Cloud Console
                  </DropdownMenuItem>
                }
              />
            </span>
            <IconButton
              label={props.expanded ? 'Close the payload' : 'Open the payload'}
              icon={ChevronDown}
              className={cn(props.expanded && 'rotate-180')}
              onClick={act(props.onExpand)}
            />
          </>
        }
      >
        <div className="min-w-0">
          <MessageBody message={head} stack={stack} />
          {Object.keys(entry.fields).length > 0 && (
            <span className="mt-0.5 flex flex-wrap gap-1 font-sans text-[10.5px]">
              {Object.entries(entry.fields)
                .slice(0, 4)
                .map(([key, value]) => (
                  <button
                    key={key}
                    type="button"
                    title={`Add ${key} = ${value} to the query`}
                    className="max-w-56 truncate rounded bg-muted px-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                    onClick={act(() => actions.onField(key, value))}
                  >
                    {key}: {value}
                  </button>
                ))}
            </span>
          )}
          {props.expanded && (
            <pre
              data-payload
              className="mt-1 overflow-x-auto rounded-md border bg-muted/40 p-2 text-[11px] leading-4"
            >
              {JSON.stringify(
                {
                  project: entry.project,
                  insertId: entry.id,
                  time: entry.time,
                  severity: entry.severity,
                  service: entry.service,
                  trace: entry.trace,
                  fields: entry.fields,
                  message: entry.message,
                },
                null,
                2,
              )}
            </pre>
          )}
        </div>
      </LogRow>
    </div>
  );
});
