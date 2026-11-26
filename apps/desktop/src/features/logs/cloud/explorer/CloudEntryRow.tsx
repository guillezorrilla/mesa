import type { CloudLogEntry } from '@mesa/core';
import { cloudLevel, entryConsoleUrl, jsonObject } from '@mesa/core/browser';
import { ChevronDown, Eye, EyeOff, MessageSquareText, Wrench } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { CopyButton } from '../../shared/CopyButton';
import { LevelBadge } from '../../shared/LevelBadge';
import { LogRow } from '../../shared/LogRow';
import { clockTime } from '../../shared/logLines';
import { JsonTree } from '../JsonPayloadPanel';
import { MessagePanel } from '../MessagePanel';
import type { EntryActions } from '../types';
import { severityLabel } from './cloudColumns';

/** A message as the payload tree shows it: a JSON one as its own tree, any other as its text. */
const payloadOf = (message: string) => jsonObject(message) ?? message;

/** A message past this many lines or characters shows its first 3 lines, with more. */
const LONG = { lines: 3, chars: 320 };

/**
 * One Cloud Logs entry on the shared LogRow (CONTEXT.md, Cloud Logs): its time, its severity's badge
 * (every one, DEFAULT and NOTICE too), its service, the fields pinned as columns, and its message
 * with its stack folded, a long one to 3 lines with more; opened, its whole payload as a tree. A cited entry is marked. Selected, it shows its own action line under the message (so
 * nothing covers the text): Show and Hide matching, Ask Claude, Fix in session, Copy (with its
 * Cloud Console link) and Payload.
 */
export const CloudEntryRow = memo(function CloudEntryRow(props: {
  entry: CloudLogEntry;
  selected: boolean;
  cited: boolean;
  expanded: boolean;
  /** The context fields pinned as columns (Show as column), in order. */
  columns: readonly string[];
  onExpand: () => void;
  actions: EntryActions;
}) {
  const { entry, actions } = props;
  const [more, setMore] = useState(false);
  // A JSON message is one summary line already (MessagePanel); any other folds past LONG.
  const long =
    !jsonObject(entry.message) &&
    (entry.message.split('\n').length > LONG.lines || entry.message.length > LONG.chars);
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
        badge={
          <LevelBadge level={cloudLevel(entry.severity)} label={severityLabel(entry.severity)} />
        }
        logger={entry.service}
        loggerAlways
      >
        <div className="min-w-0">
          <div className="flex min-w-0 gap-3">
            {props.columns.map((key) => (
              <span
                key={key}
                data-column={key}
                title={`${key}: ${entry.fields[key] ?? '(none)'}`}
                className="w-28 shrink-0 truncate text-muted-foreground"
              >
                {entry.fields[key] ?? ''}
              </span>
            ))}
            <div className="min-w-0 flex-1">
              <div className={cn(long && !more && 'line-clamp-3')}>
                <MessagePanel message={entry.message} />
              </div>
              {long && (
                <button
                  type="button"
                  className="font-sans text-[11px] text-muted-foreground hover:text-foreground"
                  onClick={(event) => {
                    event.stopPropagation();
                    setMore(!more);
                  }}
                >
                  {more ? 'less' : 'more'}
                </button>
              )}
            </div>
          </div>
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
            <div
              data-payload
              className="mt-1 overflow-x-auto rounded-md border bg-muted/40 px-3 py-2"
            >
              <JsonTree
                json={{
                  project: entry.project,
                  insertId: entry.id,
                  time: entry.time,
                  severity: entry.severity,
                  service: entry.service,
                  trace: entry.trace,
                  fields: entry.fields,
                  message: payloadOf(entry.message),
                }}
              />
            </div>
          )}
        </div>
      </LogRow>
    </div>
  );
});
