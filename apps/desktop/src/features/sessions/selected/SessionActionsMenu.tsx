import type { SavedPrompt, TreeRow } from '@mesa/core';
import { GENERAL_PROJECT, isRun, supportsAgentCapability } from '@mesa/core/browser';
import {
  Download,
  ExternalLink,
  Forward,
  MoreVertical,
  Plus,
  RotateCcw,
  Square,
  TerminalSquare,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { KnowledgeContext } from '@/features/vault/KnowledgeContext';
import type { OpenDialog } from '../dialogs/SessionDialogs';
import { exited, queued, resumable } from '../rows';
import type { SessionCommands } from '../useSessionCommands';
import { PromptComposer } from './PromptComposer';
import { RowMenu } from './RowMenu';
import type { PromptInsert } from './usePromptInsert';
import type { SessionPrompt } from './useSessionPrompt';

/**
 * The selected session's Session actions menu: its commands, its prompt, and its knowledge; a
 * session started outside Mesa offers only Adopt.
 */
export function SessionActionsMenu({
  row,
  acting,
  commands,
  prompt,
  insert,
  savedPrompts,
  onDialog,
}: {
  row: TreeRow;
  acting: boolean;
  commands: SessionCommands;
  prompt: SessionPrompt;
  insert: PromptInsert;
  savedPrompts?: readonly SavedPrompt[];
  onDialog: (dialog: OpenDialog) => void;
}) {
  return (
    <details ref={insert.actionsMenu} className="relative z-20">
      <summary
        aria-label="Session actions"
        className="flex size-8 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <MoreVertical aria-hidden className="size-4" />
      </summary>
      {row.managed ? (
        <div className="absolute right-0 mt-2 flex w-80 flex-wrap items-center gap-2 rounded-lg border bg-popover p-3 shadow-lg">
          <Button
            variant="outline"
            size="sm"
            onClick={() => commands.openTerminal(row.id)}
            disabled={!row.alive || acting}
          >
            <ExternalLink aria-hidden /> Open in terminal app
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => commands.openChildTerminal(row)}
            disabled={exited(row) || acting}
          >
            <TerminalSquare aria-hidden /> New terminal session
          </Button>
          {row.project !== GENERAL_PROJECT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() =>
                commands.open({ project: row.project, parent: row.id, worktree: true })
              }
              disabled={exited(row) || acting}
            >
              <Plus aria-hidden /> New child worktree session
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => commands.stop(row.id)}
            disabled={!(row.alive || queued(row)) || acting}
          >
            <Square aria-hidden /> {queued(row) ? 'Cancel' : 'Stop'}
          </Button>
          {row.children.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={acting}
              onClick={() => onDialog({ kind: 'stop-descendants', row })}
            >
              <Square aria-hidden /> Stop descendants
            </Button>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={() => commands.resume(row.id)}
            disabled={!resumable(row) || acting}
          >
            <RotateCcw aria-hidden /> Resume
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onDialog({ kind: 'dependency', row })}
            disabled={acting}
          >
            Set dependency
          </Button>
          {queued(row) && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => commands.forceStart(row.id)}
              disabled={acting}
            >
              Start now
            </Button>
          )}
          {row.kind === 'interactive' &&
            !row.background &&
            row.agent !== 'terminal' &&
            supportsAgentCapability(row.agent, 'fork') && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => commands.fork(row.id)}
                  disabled={!row.agentSessionId || acting}
                >
                  <Plus aria-hidden /> Fork session
                </Button>
                {row.project !== GENERAL_PROJECT && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => onDialog({ kind: 'fork', row })}
                    disabled={!row.agentSessionId || acting}
                  >
                    <Plus aria-hidden /> Fork into worktree
                  </Button>
                )}
              </>
            )}
          {!isRun(row) && row.kind !== 'terminal' && row.project !== GENERAL_PROJECT && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onDialog({ kind: 'handoff', row })}
              disabled={exited(row) || !row.goal || acting}
            >
              <Forward aria-hidden /> Hand off
            </Button>
          )}
          <RowMenu
            sessionId={row.id}
            canRemove={exited(row) && !queued(row) && !acting}
            onLog={() => onDialog({ kind: 'log', row })}
            onRename={() => onDialog({ kind: 'rename', row })}
            onDependency={() => onDialog({ kind: 'dependency', row })}
            onRemove={() => onDialog({ kind: 'remove', row })}
            onRemoveDescendants={
              row.children.length > 0
                ? () => onDialog({ kind: 'remove-descendants', row })
                : undefined
            }
          />
          {!isRun(row) && row.kind !== 'terminal' && !exited(row) && (
            <PromptComposer
              sessionId={row.id}
              acting={acting}
              image={prompt.image}
              promptField={insert.promptField}
              savedPrompts={savedPrompts}
              onInsert={insert.insertPrompt}
              onSend={(text, form, image) => prompt.send(row.id, text, form, false, image)}
              onPickImage={() => prompt.pickImage(row.id)}
              onClearImage={prompt.clearImage}
            />
          )}
          <div className="max-h-64 w-full overflow-auto">
            <KnowledgeContext session={row.id} />
          </div>
        </div>
      ) : (
        <Button
          variant="outline"
          size="sm"
          onClick={() => commands.adopt(row.agentSessionId, row.project ?? undefined)}
        >
          <Download aria-hidden /> Adopt
        </Button>
      )}
    </details>
  );
}
