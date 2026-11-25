import type { AskTurn, CloudAsk } from '@mesa/core';
import { BookmarkPlus, Copy, MessageSquareText, SquareTerminal } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import type { CloudAsked, CloudFilters } from '@/lib/client/logs';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall } from '@/lib/useCommand';
import { CloudProjectDialog } from './CloudProjectDialog';
import { citedParts } from './cloudLines';
import { useCloudSession } from './useCloudSession';

const SUGGESTIONS = [
  'What errors happen most?',
  'What changed in the last hour?',
  'Which customers are hit?',
];

/** One turn: the question, the answer with its citations, and each query the agent ran. */
function Turn(props: {
  turn: AskTurn;
  onCite: (id: string) => void;
  onSaveView: (query: { project?: string; filter: string }) => void;
}) {
  const { clipboard } = usePlatform();
  const cited = new Set(props.turn.cited);
  return (
    <li className="grid gap-2">
      <p className="justify-self-end rounded-lg bg-muted px-3 py-1.5 text-sm">
        {props.turn.question}
      </p>
      <p className="whitespace-pre-wrap text-sm leading-6">
        {citedParts(props.turn.answer, cited).map((part, i) =>
          'id' in part ? (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed answer
              key={i}
              type="button"
              title="Show this entry"
              className="mx-0.5 rounded bg-state-working/15 px-1 font-mono text-[11px] hover:bg-state-working/25 focus-visible:outline-2 focus-visible:outline-ring"
              onClick={() => props.onCite(part.id)}
            >
              {part.id.slice(0, 8)}
            </button>
          ) : (
            part.text
          ),
        )}
      </p>
      {props.turn.queries.length > 0 && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer">
            {props.turn.queries.length} {props.turn.queries.length === 1 ? 'query' : 'queries'} run
          </summary>
          <ol className="mt-1 grid gap-1.5">
            {props.turn.queries.map((query, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: one turn's queries, in order
              <li key={i} className="grid gap-1 rounded-md border bg-muted/30 p-2">
                <code className="line-clamp-3 font-mono text-[11px] [overflow-wrap:anywhere]">
                  {query.project ? `${query.project}: ` : ''}
                  {query.filter}
                </code>
                <span className="flex gap-1">
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => void clipboard.write(query.filter)}
                  >
                    <Copy aria-hidden /> Copy
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="h-6"
                    onClick={() => props.onSaveView(query)}
                  >
                    <BookmarkPlus aria-hidden /> Save as view
                  </Button>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </li>
  );
}

/**
 * Ask mode (CONTEXT.md, Ask (logs)): a conversation kept per profile, whose follow-ups keep its
 * context. The agent reads the entries the filters pick, may run read-only queries of its own,
 * cites entries by id, and each query it ran has Copy and Save as view. The first Ask on prod asks
 * the person first; Open in a session asks which project, General by default.
 */
export function CloudAskPanel(props: {
  filters: CloudFilters;
  conversation?: CloudAsk;
  onAsked: (asked: CloudAsked) => void;
  onCite: (id: string) => void;
  onSaveView: (query: { project?: string; filter: string }) => void;
  onSession: (id: string) => void;
}) {
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  /** The GCP projects whose prod entries the person is asked to send, while asked. */
  const [confirming, setConfirming] = useState<string[]>();
  const [opening, setOpening] = useState(false);
  const call = useCall();
  const toast = useToast();
  const start = useCloudSession();
  const turns = props.conversation?.turns ?? [];
  const ask = async (allowProd = false) => {
    if (!question.trim()) return;
    setBusy(true);
    const result = await call('logs.ask', {
      ...props.filters,
      question,
      conversation: props.conversation?.id,
      allowProd,
    });
    setBusy(false);
    if (result.ok) {
      setQuestion('');
      return props.onAsked(result.data);
    }
    const details = result.error.details as { reason?: string; projects?: string[] } | undefined;
    if (result.error.code === 'needs_approval' && details?.reason === 'prod_ask')
      setConfirming(details.projects ?? []);
    else toast(result.error.message);
  };
  const goal = () =>
    [
      question.trim() || turns.at(-1)?.question || 'Look into these Cloud Logs entries.',
      ...turns.slice(-3).flatMap((t) => ['', `Earlier: ${t.question}`, t.answer]),
      '',
      'Read more entries with mesa logs gcp --json and mesa logs errors --json; the filters used:',
      ...(turns.at(-1)?.queries ?? []).map((q) => `${q.project ?? ''}: ${q.filter}`),
    ].join('\n');
  return (
    <section
      aria-label="Ask the logs"
      className="flex min-h-[60vh] flex-col rounded-lg border bg-card"
    >
      <header className="flex items-center gap-2 border-b px-4 py-2.5">
        <MessageSquareText aria-hidden className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">{turns[0]?.question ?? 'New conversation'}</span>
        <Button
          size="sm"
          variant="ghost"
          className="ml-auto"
          disabled={!turns.length}
          onClick={() => setOpening(true)}
        >
          <SquareTerminal aria-hidden /> Open in a session
        </Button>
      </header>
      <div className="min-h-0 flex-1 overflow-auto px-4 py-4" role="status" aria-live="polite">
        {turns.length ? (
          <ol className="mx-auto grid max-w-3xl gap-6">
            {turns.map((turn) => (
              <Turn key={turn.at} turn={turn} onCite={props.onCite} onSaveView={props.onSaveView} />
            ))}
          </ol>
        ) : (
          <div className="mx-auto grid max-w-xl gap-2">
            <Muted size="xs">
              An agent reads the entries the filters pick, may run more read-only queries, and
              answers citing the entries it used. Emails and IP addresses are masked before it reads
              them.
            </Muted>
            {SUGGESTIONS.map((text) => (
              <Button
                key={text}
                size="sm"
                variant="outline"
                className="justify-start font-normal"
                onClick={() => setQuestion(text)}
              >
                {text}
              </Button>
            ))}
          </div>
        )}
        {busy && (
          <Muted className="mx-auto mt-4 max-w-3xl animate-pulse">
            Reading the logs and writing an answer
          </Muted>
        )}
      </div>
      <form
        className="mx-auto flex w-full max-w-3xl items-end gap-2 border-t p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void ask();
        }}
      >
        <Textarea
          aria-label="Question about the logs"
          placeholder={turns.length ? 'Ask a follow-up' : 'Why did checkout errors spike?'}
          rows={2}
          className="min-h-0 flex-1 resize-none text-sm"
          value={question}
          onChange={(event) => setQuestion(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key !== 'Enter' || event.shiftKey) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
        />
        <Button size="sm" type="submit" disabled={busy || !question.trim()}>
          Ask
        </Button>
      </form>
      {confirming && (
        <ActionDialog
          testId="prod-ask-dialog"
          title="Entries Ask reads are sent to the model"
          description={`Ask on prod sends the entries it reads in ${confirming.join(', ') || 'these GCP projects'}, which may hold customer data, to the agent's model, with emails and IP addresses masked. You confirm this once for each of them.`}
          submit={{ label: 'Send and ask', testId: 'confirm-prod-ask', disabled: false }}
          onSubmit={() => {
            setConfirming(undefined);
            void ask(true);
          }}
          onCancel={() => setConfirming(undefined)}
        />
      )}
      {opening && (
        <CloudProjectDialog
          title="Open in which project?"
          description="A session starts there with the conversation and its queries as its goal."
          onCancel={() => setOpening(false)}
          onPick={(project) => {
            setOpening(false);
            void start(project, goal()).then((id) => id && props.onSession(id));
          }}
        />
      )}
    </section>
  );
}
