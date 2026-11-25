import type { CloudAsk } from '@mesa/core';
import { PanelRightClose, SquarePen } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { ProdAskDialog } from '../ProdAskDialog';
import { useLogAsk } from '../useLogAsk';
import { AskComposer } from './AskComposer';
import { AskTurn } from './AskTurn';

/**
 * Claude beside the Explorer (CONTEXT.md, Ask (logs)): a kept conversation whose context is the
 * query, its results and the selected entries; answers cite entries that highlight in the results,
 * a suggested query has Apply query; masking and the first prod Ask's confirmation stay.
 */
export function ClaudePanel(props: {
  filters: CloudFilters;
  conversation: CloudAsk | undefined;
  selected: readonly string[];
  draft?: string;
  onAsked: (asked: CloudAsked) => void;
  onNew: () => void;
  onCite: (id: string) => void;
  onApply: (query: string) => void;
  onSaveView: (filter: string) => void;
  onClose: () => void;
}) {
  const ask = useLogAsk(props.filters, props.conversation?.id, props.onAsked);
  const turns = props.conversation?.turns ?? [];
  const withSelection = (question: string) =>
    props.selected.length
      ? `About the selected entries ${props.selected.map((id) => `[${id}]`).join(' ')}: ${question}`
      : question;
  return (
    <aside aria-label="Claude" className="flex min-h-0 flex-col border-l bg-card">
      <header className="flex items-center gap-1 border-b px-3 py-2">
        <span className="text-sm font-semibold">Claude</span>
        <span className="truncate text-[11px] text-muted-foreground">
          {props.conversation
            ? `${turns.length} ${turns.length === 1 ? 'turn' : 'turns'}`
            : 'new conversation'}
        </span>
        <IconButton
          label="New conversation"
          icon={SquarePen}
          className="ml-auto"
          onClick={props.onNew}
        />
        <IconButton label="Close Claude" icon={PanelRightClose} onClick={props.onClose} />
      </header>
      <ol
        aria-label="Conversation"
        className="grid min-h-0 flex-1 content-start gap-5 overflow-y-auto p-3"
      >
        {turns.map((turn, i) => (
          <AskTurn
            // biome-ignore lint/suspicious/noArrayIndexKey: a conversation's turns only grow
            key={i}
            turn={turn}
            onCite={props.onCite}
            onApply={props.onApply}
            onSaveView={props.onSaveView}
          />
        ))}
        {!turns.length && (
          <Muted size="xs">
            Ask about the entries shown: Claude reads the query, its results and the entries you
            select.
          </Muted>
        )}
      </ol>
      <AskComposer
        busy={ask.busy}
        selected={props.selected.length}
        draft={props.draft}
        onAsk={(question) => ask.ask(withSelection(question))}
      />
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
