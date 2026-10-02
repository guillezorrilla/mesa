import type { Config, UsageReport } from '@mesa/core';
import { BellRing } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useRun } from '@/lib/useCommand';
import { money } from './format';

type Key = keyof Config['usage'];
const LIMITS = [
  ['dailyAlertUsd', 'Daily', 'today'],
  ['weeklyAlertUsd', 'Weekly', '7d'],
  ['monthlyAlertUsd', 'Monthly', 'month'],
] as const;

/** Informational spend thresholds: each shows progress toward it, and all save together. */
export function CostAlerts(props: {
  usage: Config['usage'];
  report: UsageReport;
  onSaved: () => Promise<void>;
}) {
  const run = useRun();
  const toast = useToast();
  const [saving, setSaving] = useState(false);
  const shown = (key: Key) => (props.usage[key] ? String(props.usage[key]) : '');
  const [draft, setDraft] = useState<Record<Key, string>>({
    dailyAlertUsd: shown('dailyAlertUsd'),
    weeklyAlertUsd: shown('weeklyAlertUsd'),
    monthlyAlertUsd: shown('monthlyAlertUsd'),
  });
  // biome-ignore lint/correctness/useExhaustiveDependencies: a saved profile replaces the draft.
  useEffect(
    () =>
      setDraft({
        dailyAlertUsd: shown('dailyAlertUsd'),
        weeklyAlertUsd: shown('weeklyAlertUsd'),
        monthlyAlertUsd: shown('monthlyAlertUsd'),
      }),
    [props.usage],
  );
  const amount = (key: Key) => (draft[key].trim() === '' ? 0 : Number(draft[key]));
  const valid = LIMITS.every(([key]) => Number.isFinite(amount(key)) && amount(key) >= 0);
  const changed = LIMITS.filter(([key]) => amount(key) !== props.usage[key]);
  const save = async () => {
    setSaving(true);
    try {
      for (const [key] of changed)
        if (!(await run('config.set', { path: `usage.${key}`, value: amount(key) }))) break;
    } finally {
      // Limits saved before a failure still show as saved.
      await props.onSaved();
      setSaving(false);
    }
  };
  return (
    <section className="space-y-4 rounded-lg border bg-background p-4" aria-label="Cost alerts">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="flex items-center gap-2 text-sm font-medium">
            <BellRing aria-hidden className="size-4 text-state-waiting" /> Cost alerts
          </h3>
          <Muted size="xs" className="mt-1">
            Informational only. Cost alerts never pause sessions or block requests.
          </Muted>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 text-xs"
          onClick={() =>
            toast(
              `Preview: known estimated daily cost reached your ${money(amount('dailyAlertUsd') || 10)} alert. Agents keep running.`,
              'alert',
            )
          }
        >
          Preview alert
        </Button>
      </div>
      <div className="grid divide-y md:grid-cols-3 md:divide-x md:divide-y-0">
        {LIMITS.map(([key, label, period]) => {
          const limit = props.usage[key];
          const spent = props.report.periods[period].estimatedCostUsd;
          const reached = props.report.alerts.some((alert) => alert.period === period);
          return (
            <div key={key} className="space-y-2 py-3 md:px-4 md:py-0 md:first:pl-0 md:last:pr-0">
              <label htmlFor={`usage-${key}`} className="text-xs font-medium text-muted-foreground">
                {label}
              </label>
              <div className="flex items-center rounded-md border bg-card px-2 focus-within:ring-1 focus-within:ring-ring">
                <span className="text-xs text-muted-foreground">$</span>
                <input
                  id={`usage-${key}`}
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  placeholder="Off"
                  aria-invalid={!Number.isFinite(amount(key)) || amount(key) < 0}
                  className="w-full [appearance:textfield] bg-transparent px-1.5 py-1 text-sm outline-none placeholder:text-muted-foreground [&::-webkit-inner-spin-button]:appearance-none"
                  value={draft[key]}
                  onChange={(event) => setDraft((last) => ({ ...last, [key]: event.target.value }))}
                />
              </div>
              {limit > 0 ? (
                <>
                  <div className="h-1 overflow-hidden rounded-full bg-accent">
                    <div
                      className={reached ? 'h-full bg-state-waiting' : 'h-full bg-state-working'}
                      style={{ width: `${Math.min(100, ((spent ?? 0) / limit) * 100)}%` }}
                    />
                  </div>
                  <p
                    className={`text-[11px] ${reached ? 'text-state-waiting' : 'text-muted-foreground'}`}
                  >
                    {reached ? 'Reached: ' : ''}
                    {money(spent)} of {money(limit)}
                  </p>
                </>
              ) : (
                <p className="text-[11px] text-muted-foreground">No alert configured</p>
              )}
            </div>
          );
        })}
      </div>
      <div className="flex items-end justify-between gap-3 border-t pt-3">
        <p className="text-[11px] text-muted-foreground">
          Costs are estimated from usage Mesa reads in your sessions and may differ from provider
          billing. Daily and weekly limits count UTC days; monthly starts on the first of the UTC
          month.
        </p>
        <Button
          size="sm"
          variant="secondary"
          className="h-7 shrink-0 text-xs"
          disabled={saving || !valid || !changed.length}
          onClick={() => void save()}
        >
          Save
        </Button>
      </div>
    </section>
  );
}
