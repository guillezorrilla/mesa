import { ExternalLink, RefreshCw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * A saved decision's probabilities and confidence (its receipt's inputs), compactly:
 * `fixed-clock 0.80, retry 0.20, confidence 0.80`; undefined when it has neither.
 */
function oddsOf({ probabilities, confidence }: Record<string, unknown>) {
  const parts = [
    ...Object.entries(probabilities && typeof probabilities === 'object' ? probabilities : {})
      .filter((entry): entry is [string, number] => typeof entry[1] === 'number')
      .map(([option, p]) => `${option} ${p.toFixed(2)}`),
    ...(typeof confidence === 'number' ? [`confidence ${confidence.toFixed(2)}`] : []),
  ];
  return parts.length ? parts.join(', ') : undefined;
}

/** Meaningful vault history for the selected project or session, never a global activity feed. */
export function KnowledgeContext(props: { project?: string; session?: string }) {
  const scope = { project: props.project, session: props.session };
  const decisions = useCommand('receipts.list', { ...scope, kind: 'decision' });
  const guardrails = useCommand('receipts.list', { ...scope, kind: 'guardrail' });
  const changes = useCommand('receipts.list', { ...scope, kind: 'vault-change' });
  const run = useRun();
  const entries = [
    ...(decisions.data ?? []),
    ...(guardrails.data ?? []),
    ...(changes.data ?? []),
  ].sort((a, b) => b.receipt.id.localeCompare(a.receipt.id));
  if (!entries.length && !decisions.busy && !guardrails.busy && !changes.busy) return null;
  return (
    <section data-testid="knowledge-context" className="space-y-2 rounded-lg border bg-card/40 p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Decisions and vault changes</h3>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Refresh decisions and vault changes"
          onClick={() => {
            void decisions.refresh();
            void guardrails.refresh();
            void changes.refresh();
          }}
        >
          <RefreshCw aria-hidden />
        </Button>
      </div>
      {entries.map((entry) => {
        // The note a change or a saved decision names, else the receipt itself.
        const target =
          typeof entry.receipt.outputs.target === 'string'
            ? entry.receipt.outputs.target
            : entry.path;
        const rationale = entry.receipt.inputs.rationale;
        const answer = entry.receipt.decisions[0];
        const odds = oddsOf(entry.receipt.inputs);
        const detail =
          typeof rationale === 'string'
            ? rationale
            : answer
              ? `${answer.question}: ${String(answer.answer)}`
              : entry.receipt.outputs.error &&
                  typeof entry.receipt.outputs.error === 'object' &&
                  'message' in entry.receipt.outputs.error
                ? String(entry.receipt.outputs.error.message)
                : undefined;
        return (
          <div key={entry.receipt.id} className="flex items-start gap-3 border-t pt-2 text-sm">
            <div className="min-w-0 flex-1">
              <p className="font-medium">{entry.summary}</p>
              {detail && <p className="text-muted-foreground">{detail}</p>}
              {odds && (
                <p data-testid="knowledge-odds" className="text-xs text-muted-foreground">
                  {odds}
                </p>
              )}
              <Muted size="xs">
                {entry.receipt.started} · {entry.receipt.status}
                {entry.receipt.actor ? ` · by ${entry.receipt.actor}` : ''} · {target}
              </Muted>
            </div>
            <Button
              size="sm"
              variant="ghost"
              aria-label={`Open ${target} in Obsidian`}
              onClick={() => void run('vault.openNote', { note: target })}
            >
              <ExternalLink aria-hidden /> Open in Obsidian
            </Button>
          </div>
        );
      })}
    </section>
  );
}
