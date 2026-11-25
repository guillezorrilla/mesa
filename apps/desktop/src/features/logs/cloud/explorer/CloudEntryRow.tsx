import type { CloudLogEntry } from '@mesa/core';
import { cloudLevel, entryConsoleUrl } from '@mesa/core/browser';
import { ChevronDown, Eye, EyeOff, MessageSquareText, Wrench } from 'lucide-react';
import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CopyButton } from '../../shared/CopyButton';
import { LevelBadge } from '../../shared/LevelBadge';
import { LogRow } from '../../shared/LogRow';
import { clockTime } from '../../shared/logLines';
import { MessagePanel } from '../MessagePanel';
import type { EntryActions } from '../types';

/**
 * One Cloud Logs entry on the shared LogRow (CONTEXT.md, Cloud Logs): its time, level, service and
 * message with its stack folded; its context fields a click from the query; opened, its whole
 * payload. A cited entry is marked. Selected, it shows its own action line under the message (so
 * nothing covers the text): Show and Hide matching, Ask Claude, Fix in session, Copy (with its
 * Cloud Console link) and Payload.
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
      >
        <div className="min-w-0">
          <MessagePanel message={entry.message} />
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
                    onClick={(event) => {
                      event.stopPropagation();
                      actions.onField(key, value);
                    }}
                  >
                    {key}: {value}
                  </button>
                ))}
            </span>
          )}
          {props.selected && (
            <div
              aria-label="Entry actions"
              role="toolbar"
              className="mt-1 flex flex-wrap items-center gap-1 font-sans"
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => event.stopPropagation()}
            >
              <Button size="xs" variant="ghost" onClick={() => actions.onShow(entry)}>
                <Eye aria-hidden /> Show matching
              </Button>
              <Button size="xs" variant="ghost" onClick={() => actions.onHide(entry)}>
                <EyeOff aria-hidden /> Hide matching
              </Button>
              <Button size="xs" variant="ghost" onClick={() => actions.onAsk(entry)}>
                <MessageSquareText aria-hidden /> Ask Claude
              </Button>
              <Button size="xs" variant="ghost" onClick={() => actions.onFix(entry)}>
                <Wrench aria-hidden /> Fix in session
              </Button>
              <CopyButton
                label="Copy"
                onCopy={(format) => actions.onCopy(entry, format)}
                extra={
                  <DropdownMenuItem
                    onSelect={() => actions.onCopyText(entryConsoleUrl(entry), 'the link')}
                  >
                    Link to Cloud Console
                  </DropdownMenuItem>
                }
              />
              <Button
                size="xs"
                variant="ghost"
                aria-expanded={props.expanded}
                onClick={props.onExpand}
              >
                <ChevronDown aria-hidden className={cn(props.expanded && 'rotate-180')} /> Payload
              </Button>
            </div>
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
