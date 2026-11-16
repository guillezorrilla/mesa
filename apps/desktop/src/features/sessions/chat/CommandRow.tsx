import type { ChatMessage, Config, TreeRow } from '@mesa/core';
import { type ReactNode, useEffect, useState } from 'react';
import { CommandCardFrame, CommandOutput } from './CommandCardFrame';
import { ContextUsagePanel } from './ContextUsagePanel';
import type { PlacedCard } from './commandCards';
import { ModelCard } from './ModelCard';
import { SettingsCard } from './SettingsCard';
import { UsagePanel } from './UsagePanel';

/**
 * A slash command in the chat: its card when it has one (a settings form, `/model`'s picker,
 * `/usage` and `/context` read as data), else
 * the command with what it printed. Only the newest card opens by itself and takes the keys.
 */
export function CommandRow(props: {
  message: ChatMessage;
  sessionId: string;
  /** The session's row: `/model`'s card needs a managed one. */
  row?: TreeRow;
  placed?: PlacedCard;
  newest: boolean;
  terminal?: Config['terminal'];
  /** Gives the keys back to the composer, when a card closes. */
  onFocusComposer: () => void;
}) {
  const { message, placed } = props;
  const [open, setOpen] = useState(props.newest);
  // A command shows before its output: it opens once that output makes it the newest card.
  useEffect(() => setOpen(props.newest), [props.newest]);
  const raw = { output: message.output, error: message.error, terminal: props.terminal };
  const frame = (title: string, body: ReactNode) => (
    <li className="flex">
      <CommandCardFrame
        command={message.text}
        title={title}
        open={open}
        onOpen={() => setOpen(true)}
        onClose={() => {
          setOpen(false);
          props.onFocusComposer();
        }}
        raw={raw}
      >
        {body}
      </CommandCardFrame>
    </li>
  );
  if (placed?.card.kind === 'form')
    return frame(
      'Settings',
      <SettingsCard
        sessionId={props.sessionId}
        form={placed.card.form}
        replies={placed.replies}
        autoFocus={props.newest}
      />,
    );
  if (placed?.card.kind === 'usage')
    return frame('Usage', <UsagePanel report={placed.card.report} />);
  if (placed?.card.kind === 'context')
    return frame('Context', <ContextUsagePanel report={placed.card.report} />);
  if (placed?.card.kind === 'model' && props.row?.managed)
    return frame('Model and effort', <ModelCard row={props.row} autoFocus={props.newest} />);
  return (
    <li className="flex">
      <div
        data-testid="command-output"
        className="flex w-full flex-col gap-2 rounded-lg border bg-card p-3"
      >
        <code className="font-mono text-sm">{message.text}</code>
        <CommandOutput {...raw} />
      </div>
    </li>
  );
}
