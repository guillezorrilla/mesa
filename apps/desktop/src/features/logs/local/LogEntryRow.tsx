import { muteKey, requestIds } from '@mesa/core/browser';
import { EyeOff, type LucideIcon, SendHorizontal, Waypoints } from 'lucide-react';
import { type ComponentProps, memo } from 'react';
import { CopyButton } from '../shared/CopyButton';
import { LevelBadge } from '../shared/LevelBadge';
import { LogRow } from '../shared/LogRow';
import { clockTime, type KeyedEntry } from '../shared/logLines';
import { MessageBody } from '../shared/MessageBody';
import { RequestMenu } from './RequestMenu';
import type { RowActions } from './useRowActions';

/** One hover action: an icon button that never selects the row; a menu's trigger too (RequestMenu). */
function Action({
  label,
  icon: Icon,
  onClick,
  onKeyDown,
  ...trigger
}: { label: string; icon: LucideIcon } & ComponentProps<'button'>) {
  return (
    <button
      {...trigger}
      type="button"
      aria-label={label}
      title={label}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        onClick?.(event);
      }}
      onKeyDown={(event) => {
        event.stopPropagation();
        onKeyDown?.(event);
      }}
    >
      <Icon aria-hidden className="size-3.5" />
    </button>
  );
}

/**
 * One local log entry (LogRow): its time, level badge, logger, message with request ids to filter
 * by and its stack, and on hover Copy (CopyButton), Send, its request's menu (RequestMenu) and
 * Mute. A click selects it.
 */
export const LogEntryRow = memo(function LogEntryRow(props: {
  entry: KeyedEntry;
  selected: boolean;
  actions: RowActions;
}) {
  const { entry, actions } = props;
  const mute = muteKey(entry.message);
  const request = requestIds(entry.message)[0];
  return (
    <LogRow
      level={entry.level}
      selected={props.selected}
      onSelect={() => actions.onToggle(entry.key)}
      time={clockTime(entry.time)}
      badge={<LevelBadge level={entry.level} />}
      logger={entry.logger}
      actions={
        <>
          <CopyButton onCopy={(format) => actions.onCopy(entry, format)} />
          <Action
            label={actions.sendLabel}
            icon={SendHorizontal}
            onClick={() => actions.onSendOne(entry.key)}
          />
          {request && (
            <RequestMenu id={request} onShow={actions.onShowRequest} onSend={actions.onSendRequest}>
              <Action label={`Request ${request}`} icon={Waypoints} />
            </RequestMenu>
          )}
          <Action
            label={`Mute lines like this: ${mute}`}
            icon={EyeOff}
            onClick={() => actions.onMute(mute)}
          />
        </>
      }
    >
      <MessageBody message={entry.message} stack={entry.stack} onRequest={actions.onRequest} />
    </LogRow>
  );
});
