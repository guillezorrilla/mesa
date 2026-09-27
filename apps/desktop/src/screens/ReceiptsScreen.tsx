import type { ReceiptEntry } from '@mesa/core';
import { percent, RECEIPT_TYPES } from '@mesa/core/browser';
import { Search, X } from 'lucide-react';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Progress } from '@/components/ui/progress';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

type Receipt = ReceiptEntry['receipt'];
type Recorded = Receipt['decisions'][number];

/** How many receipts the screen lists: the newest. */
const SHOWN = 50;

/** One colour per receipt status: a failure is the failed colour, a guardrail's block the warm one. */
const STATUS_TONE: Record<Receipt['status'], string> = {
  ok: 'bg-secondary text-secondary-foreground',
  failed: 'bg-state-failed/15 text-state-failed',
  blocked: 'bg-state-waiting/25 text-foreground',
};

function StatusBadge({ status }: { status: Receipt['status'] }) {
  return (
    <Badge data-status={status} className={cn('font-mono', STATUS_TONE[status])}>
      {status}
    </Badge>
  );
}

/** A receipt's start as it reads: `2026-09-24 12:00`, a receipt from before #61 with its seconds. */
const started = (at: string) => at.replace('T', ' ');

/**
 * The receipts, the audit trail of what Mesa did: the newest 50, of one type or one session when
 * filtered, and the one selected, with its frontmatter and the Faro decisions behind it.
 * `selected` is the App's, so a skill run's toast can open its receipt here.
 */
export function ReceiptsScreen(props: {
  selected: string | undefined;
  onSelect: (id: string | undefined) => void;
}) {
  const [type, setType] = useState('');
  const [session, setSession] = useState('');
  const { data: receipts } = useCommand('receipts.list', {
    limit: SHOWN,
    type: type || undefined,
    session: session || undefined,
  });
  const filtered = Boolean(type || session);
  return (
    <section data-testid="receipts-screen" className="space-y-4">
      <PageHeader
        title="Receipts"
        description="What Mesa did, newest first, with every Faro decision behind it: the vault's audit trail."
      >
        <NativeSelect
          aria-label="Type"
          data-testid="receipts-type"
          size="sm"
          className="w-36"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <NativeSelectOption value="">Every type</NativeSelectOption>
          {RECEIPT_TYPES.map((t) => (
            <NativeSelectOption key={t} value={t}>
              {t}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        {/* Applied on Enter, so each keystroke is not a look of its own. */}
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const input = e.currentTarget.elements.namedItem('session') as HTMLInputElement;
            setSession(input.value.trim());
          }}
        >
          <Input
            name="session"
            aria-label="Session"
            data-testid="receipts-session"
            placeholder="Session id"
            className="h-8 w-36 font-mono text-xs"
          />
          <Button
            type="submit"
            variant="ghost"
            size="icon-sm"
            aria-label="Filter by session"
            data-testid="receipts-session-apply"
          >
            <Search />
          </Button>
          {session && (
            <Button
              type="reset"
              variant="ghost"
              size="icon-sm"
              aria-label="Every session"
              data-testid="receipts-session-clear"
              onClick={() => setSession('')}
            >
              <X />
            </Button>
          )}
        </form>
      </PageHeader>
      <div
        className={cn(
          'grid items-start gap-4',
          props.selected && 'lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]',
        )}
      >
        <Card className="py-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Started</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Project</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Decisions</TableHead>
                <TableHead>Summary</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {receipts?.map(({ receipt: r, summary }) => (
                <TableRow
                  key={r.id}
                  data-testid="receipt-row"
                  data-status={r.status}
                  data-state={r.id === props.selected ? 'selected' : undefined}
                  className="cursor-pointer"
                  onClick={() => props.onSelect(r.id)}
                >
                  <TableCell className="font-mono text-muted-foreground text-xs">
                    {started(r.started)}
                  </TableCell>
                  <TableCell className="font-mono text-xs">{r.type}</TableCell>
                  <TableCell>{r.project}</TableCell>
                  <TableCell>
                    <StatusBadge status={r.status} />
                  </TableCell>
                  <TableCell
                    className={cn(
                      'text-right font-mono text-xs tabular-nums',
                      !r.decisions.length && 'text-muted-foreground',
                    )}
                  >
                    {r.decisions.length}
                  </TableCell>
                  <TableCell className="max-w-96 truncate">
                    {/* Button activation bubbles to the row, just like a click on any cell. */}
                    <button
                      type="button"
                      data-testid="receipt-open"
                      className="text-left hover:underline focus-visible:underline focus-visible:outline-none"
                    >
                      {summary}
                    </button>
                  </TableCell>
                </TableRow>
              ))}
              {receipts?.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={6}
                    data-testid="receipts-empty"
                    className="py-6 text-center text-muted-foreground"
                  >
                    {filtered ? 'No receipt matches these filters.' : 'No receipts yet.'}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Card>
        {props.selected && (
          <ReceiptDetails id={props.selected} onClose={() => props.onSelect(undefined)} />
        )}
      </div>
    </section>
  );
}

/** One receipt as `mesa receipts show` reads it: its frontmatter, and its decisions as a table. */
function ReceiptDetails(props: { id: string; onClose: () => void }) {
  const { data } = useCommand('receipts.get', { id: props.id });
  // The last one read stays until the next lands: never show it as this one.
  const entry = data?.receipt.id === props.id ? data : undefined;
  const r = entry?.receipt;
  const fields: [string, string | undefined][] = r
    ? [
        ['id', r.id],
        ['profile', r.profile],
        ['project', r.project],
        ['session', r.session],
        ['agent', r.agent],
        ['started', r.started],
        ['ended', r.ended],
        ['command', r.command],
        ['cost', r.cost === undefined ? undefined : `$${r.cost.toFixed(4)}`],
      ]
    : [];
  return (
    <Card
      data-testid="receipt-details"
      className="gap-4 py-4 lg:sticky lg:top-28 lg:max-h-[calc(100vh-8rem)] lg:overflow-y-auto"
    >
      <div className="flex items-start justify-between gap-2 px-4">
        <div className="grid gap-1.5">
          <h3 className="font-semibold leading-snug">{entry?.summary ?? props.id}</h3>
          {r && (
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="font-mono">
                {r.type}
              </Badge>
              <StatusBadge status={r.status} />
            </div>
          )}
        </div>
        <Button variant="ghost" size="icon-sm" aria-label="Close" onClick={props.onClose}>
          <X />
        </Button>
      </div>
      {r && (
        <>
          <dl
            data-testid="receipt-frontmatter"
            className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 px-4 text-sm"
          >
            {fields
              .filter((f): f is [string, string] => f[1] !== undefined)
              .map(([name, value]) => (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd className="break-words font-mono text-xs leading-5">{value}</dd>
                </div>
              ))}
            {(['inputs', 'outputs'] as const)
              .filter((name) => Object.keys(r[name]).length)
              .map((name) => (
                <div key={name} className="contents">
                  <dt className="text-muted-foreground">{name}</dt>
                  <dd>
                    <pre className="overflow-x-auto rounded-md bg-muted px-2 py-1 font-mono text-xs">
                      {JSON.stringify(r[name], null, 2)}
                    </pre>
                  </dd>
                </div>
              ))}
          </dl>
          <div className="grid gap-2">
            <h4 className="px-4 font-medium text-sm">Decisions</h4>
            {r.decisions.length ? (
              <DecisionsTable decisions={r.decisions} />
            ) : (
              <p className="px-4 text-muted-foreground text-sm">No Faro decision behind it.</p>
            )}
          </div>
        </>
      )}
    </Card>
  );
}

/**
 * Each Faro answer a receipt keeps (docs/receipts.md): its question, its answer, its likeliest
 * option or level, its confidence, and the backend that answered. A Noul is one calibrated
 * probability that its statement holds, with no confidence of its own (ADR-0004), so it shows
 * that probability and no confidence.
 */
function DecisionsTable({ decisions }: { decisions: Recorded[] }) {
  return (
    <Table data-testid="receipt-decisions">
      <TableHeader>
        <TableRow>
          <TableHead className="pl-4">Question</TableHead>
          <TableHead>Answer</TableHead>
          <TableHead>Top probability</TableHead>
          <TableHead>Confidence</TableHead>
          <TableHead className="pr-4">Backend</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {decisions.map((d) => {
          const [label, share] =
            d.kind === 'Noul'
              ? ['yes', d.probabilities]
              : (Object.entries(d.probabilities).sort((a, b) => b[1] - a[1])[0] ?? ['', 0]);
          return (
            <TableRow key={d.question} data-testid="decision-row" data-kind={d.kind}>
              <TableCell className="pl-4">
                <div className="font-mono text-xs">{d.question}</div>
                <div className="text-muted-foreground text-xs">{d.kind}</div>
              </TableCell>
              <TableCell className="font-mono text-xs">{answerOf(d)}</TableCell>
              <TableCell>
                <div
                  className="flex items-center gap-2"
                  title={d.kind === 'Noul' ? 'The probability that its statement holds' : undefined}
                >
                  <Progress
                    value={share * 100}
                    aria-label="Top probability"
                    className="h-1.5 w-10"
                  />
                  <span className="font-mono text-xs tabular-nums">
                    {label} {percent(share)}
                  </span>
                </div>
              </TableCell>
              <TableCell className="font-mono text-xs tabular-nums">
                {d.kind === 'Noul' ? (
                  <span
                    className="text-muted-foreground"
                    title="A Noul is one calibrated probability, with no confidence of its own"
                  >
                    none
                  </span>
                ) : (
                  percent(d.confidence)
                )}
              </TableCell>
              <TableCell className="pr-4 font-mono text-xs">{d.backend}</TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );
}

/** An answer as it reads: a Choice's option, a Score's position from 0 to 1, a Noul's yes or no. */
function answerOf(d: Recorded): string {
  if (d.kind === 'Noul') return d.answer ? 'yes' : 'no';
  if (d.kind === 'Score') return d.answer.toFixed(2);
  return d.answer;
}
