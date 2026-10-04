import type { Agent, GuardrailCheck, ManagedRow, SessionImage, TreeRow } from '@mesa/core';
import type { SessionCommands } from '../useSessionCommands';
import { ArchiveDialog } from './ArchiveDialog';
import { DependencyDialog } from './DependencyDialog';
import { DescendantDialog } from './DescendantDialog';
import { ForkDialog } from './ForkDialog';
import { GuardrailDialog } from './GuardrailDialog';
import { HandoffDialog } from './HandoffDialog';
import { LogDialog } from './LogDialog';
import { RemoveDialog } from './RemoveDialog';
import { RenameDialog } from './RenameDialog';

/**
 * The one dialog open in Sessions, if any: a row's Rename, Hand off, Log, or
 * Remove, or the guardrail's ask on a prompt a row's Send sent (its form is cleared once sent).
 */
export type OpenDialog =
  | {
      kind:
        | 'rename'
        | 'log'
        | 'remove'
        | 'fork'
        | 'dependency'
        | 'stop-descendants'
        | 'remove-descendants';
      row: ManagedRow;
    }
  /** Archive one session, or several confirmed together. */
  | { kind: 'archive'; rows: ManagedRow[] }
  /** Hand off, to `agent` when a swap asked for it. */
  | { kind: 'handoff'; row: ManagedRow; agent?: Agent }
  | {
      kind: 'guardrail';
      id: string;
      prompt: string;
      form: HTMLFormElement;
      check: GuardrailCheck;
      image?: SessionImage;
    };

/** Renders Sessions' open dialog, whose confirm runs its command. */
export function SessionDialogs({
  dialog,
  rows,
  selectedSession,
  acting,
  commands,
  onSend,
  onClose,
}: {
  dialog?: OpenDialog;
  rows: TreeRow[];
  selectedSession?: string;
  acting: boolean;
  commands: SessionCommands;
  /** Sends the guardrail's prompt again, past its ask. */
  onSend: (
    id: string,
    prompt: string,
    form: HTMLFormElement,
    yes: boolean,
    image?: SessionImage,
  ) => void;
  onClose: () => void;
}) {
  return (
    <>
      {dialog?.kind === 'handoff' && (
        <HandoffDialog
          row={dialog.row}
          agent={dialog.agent}
          disabled={acting}
          onHandoff={(note, keep, agent) => commands.handoff(dialog.row.id, note, keep, agent)}
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'fork' && (
        <ForkDialog
          row={dialog.row}
          disabled={acting}
          onFork={(branch) => commands.fork(dialog.row.id, branch)}
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'dependency' && (
        <DependencyDialog
          row={dialog.row}
          rows={rows}
          disabled={acting}
          onSave={(change) => commands.saveDependency(dialog.row.id, change)}
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'log' && <LogDialog row={dialog.row} onClose={onClose} />}
      {dialog?.kind === 'rename' && (
        <RenameDialog
          sessionId={dialog.row.id}
          name={dialog.row.name}
          disabled={acting}
          onRename={(name) => commands.rename(dialog.row.id, name)}
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'guardrail' && (
        <GuardrailDialog
          action="send"
          about={`this prompt goes to ${dialog.id}`}
          check={dialog.check}
          disabled={acting}
          onConfirm={() =>
            dialog.image && selectedSession !== dialog.id
              ? onClose()
              : onSend(dialog.id, dialog.prompt, dialog.form, true, dialog.image)
          }
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'remove' && (
        <RemoveDialog
          row={dialog.row}
          disabled={acting}
          onRemove={(opts) => commands.remove(dialog.row.id, opts)}
          onCancel={onClose}
        />
      )}
      {(dialog?.kind === 'stop-descendants' || dialog?.kind === 'remove-descendants') && (
        <DescendantDialog
          row={dialog.row}
          action={dialog.kind === 'stop-descendants' ? 'stop' : 'remove'}
          disabled={acting}
          onConfirm={(ids, options) =>
            commands.cascade(
              dialog.kind === 'stop-descendants' ? 'stop' : 'remove',
              dialog.row.id,
              ids,
              options,
            )
          }
          onCancel={onClose}
        />
      )}
      {dialog?.kind === 'archive' && (
        <ArchiveDialog
          rows={dialog.rows}
          disabled={acting}
          onArchive={() => commands.archive(dialog.rows.map((row) => row.id))}
          onDelete={(id) => commands.deletePermanently(id)}
          onCancel={onClose}
        />
      )}
    </>
  );
}
