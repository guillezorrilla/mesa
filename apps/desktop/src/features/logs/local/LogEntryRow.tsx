import { muteKey } from '@mesa/core/browser';
import { EyeOff, type LucideIcon, SendHorizontal } from 'lucide-react';
import { memo } from 'react';
import { CopyButton } from '../shared/CopyButton';
import { LevelBadge } from '../shared/LevelBadge';
import { LogRow } from '../shared/LogRow';
import { clockTime, type KeyedEntry } from '../shared/logLines';
import { MessageBody } from '../shared/MessageBody';
import type { RowActions } from './useRowActions';

/** One hover action: an icon button that never selects the row. */
function Action(props: { label: string; icon: LucideIcon; onClick: () => void }) {
  const Icon = props.icon;
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground"
      onClick={(event) => {
        event.stopPropagation();
        props.onClick();
      }}
    >
      <Icon aria-hidden className="size-3.5" />
    </button>
  );
}

/**
 * One local log entry (LogRow): its time, level badge, logger, message with request ids to filter
 * by and its stack, and on hover Copy (CopyButton), Send and Mute. A click selects it.
 */
export const LogEntryRow = memo(function LogEntryRow(props: {
  entry: KeyedEntry;
  selected: boolean;
  actions: RowActions;
}) {
  const { entry, actions } = props;
  const mute = muteKey(entry.message);
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
