import type { AskOwn, CloudAsk, CloudLogEntry } from '@mesa/core';
import { PanelRightClose, SquareArrowOutUpRight, SquarePen } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { CloudProjectDialog } from '../CloudProjectDialog';
import { ProdAskDialog } from '../ProdAskDialog';
import { useLogAsk } from '../useLogAsk';
import { AskComposerField } from './AskComposerField';
import { AskPendingPanel } from './AskPendingPanel';
import { AskTurnPanel } from './AskTurnPanel';
import { askInvestigations } from './askInvestigations';

/**
 * Claude beside the Explorer (CONTEXT.md, Ask (logs)): a kept conversation whose context is the
 * query's whole range, its results and the selected entries, the answer streaming in; answers cite
 * entries that highlight in the results, a suggested query has Apply query, and each shows its
 * model, time and cost with Fix in session; Open in a session carries the conversation on in a
 * project the person picks; quick investigations; masking and the first prod Ask's confirmation stay.
 */
export function ClaudePanel(props: {
  filters: CloudFilters;
  conversation: CloudAsk | undefined;
  selected: readonly string[];
  /** The services of the entries shown (`<project>/<service>`), for which code to read. */
  shown: readonly string[];
  /** The selected entry the company or user investigation reads its field from. */
  entry?: CloudLogEntry;
  draft?: string;
  onAsked: (asked: CloudAsked) => void;
  onNew: () => void;
  onCite: (id: string) => void;
  onApply: (query: string) => void;
  onRunOwn: (own: AskOwn) => void;
  onSaveView: (own: AskOwn) => void;
  onCarry: (conversation: string) => void;
  /** Fix in session from an answer: in the project whose code it read, else one the person picks. */
  onFix: (conversation: string, code?: string) => void;
  onClose: () => void;
}) {
  const ask = useLogAsk(props.filters, props.conversation?.id, props.onAsked, props.shown);
  const turns = props.conversation?.turns ?? [];
  const withSelection = (question: string) =>
    props.selected.length
      ? `About the selected entries ${props.selected.map((id) => `[${id}]`).join(' ')}: ${question}`
      : question;
  return (
    <aside aria-label="Claude" className="flex h-full min-h-0 min-w-0 flex-col border-l bg-card">
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-sm font-semibold">Claude</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {props.conversation
            ? `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`
            : 'new conversation'}
        </span>
        {props.conversation && (
          <IconButton
            label="Open in a session"
            icon={SquareArrowOutUpRight}
            className="ml-auto"
            onClick={() => props.conversation && props.onCarry(props.conversation.id)}
          />
        )}
        <IconButton
          label="New conversation"
          icon={SquarePen}
          className={props.conversation ? undefined : 'ml-auto'}
          onClick={props.onNew}
        />
        <IconButton label="Close Claude" icon={PanelRightClose} onClick={props.onClose} />
      </header>
      <ol
        aria-label="Conversation"
        className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-3"
      >
        {turns.map((turn, i) => (
          <AskTurnPanel
            // biome-ignore lint/suspicious/noArrayIndexKey: a conversation's turns only grow
            key={i}
            turn={turn}
            onCite={props.onCite}
            onApply={props.onApply}
            onRunOwn={props.onRunOwn}
            onSaveView={props.onSaveView}
            onFix={() => props.conversation && props.onFix(props.conversation.id, turn.code)}
          />
        ))}
        {ask.asking && <AskPendingPanel question={ask.asking.question} text={ask.asking.text} />}
        {!turns.length && !ask.asking && (
          <Muted size="xs">
            Ask about the entries shown: Claude reads the query, its results and the entries you
            select.
          </Muted>
        )}
      </ol>
      <AskComposerField
        busy={ask.busy}
        selected={props.selected.length}
        draft={props.draft}
        investigations={askInvestigations(props.filters, props.entry)}
        onInvestigate={(investigation) => void ask.ask(investigation.question, investigation.over)}
        onAsk={(question) => ask.ask(withSelection(question))}
      />
      {ask.picking && (
        <CloudProjectDialog
          title="Read code from which project?"
          description={`Claude reads this project's code, read-only, to follow the stacks of ${ask.picking.join(', ')}. Asked once: Fix in session uses it too.`}
          submit="Ask"
          onPick={(project) => void ask.pick(project)}
          onCancel={ask.cancelPick}
        />
      )}
      {ask.confirming && (
        <ProdAskDialog
          projects={ask.confirming}
          onConfirm={() => void ask.confirm()}
          onCancel={ask.cancel}
        />
      )}
    </aside>
  );
}
