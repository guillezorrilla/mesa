import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCommand, useRun } from '@/lib/useCommand';

const tokens = (value: number | null) => (value === null ? 'Unknown' : value.toLocaleString());
const dollars = (value: number | null) =>
  value === null ? 'Unknown' : value > 0 && value < 0.0001 ? '<$0.0001' : `$${value.toFixed(4)}`;

export function UsageScreen() {
  const usage = useCommand('usage.list');
  const config = useCommand('config.get');
  const run = useRun();
  const report = usage.data;
  const [days, setDays] = useState<7 | 30 | 90>(7);
  const [saving, setSaving] = useState(false);
  const [thresholds, setThresholds] = useState({
    dailyAlertUsd: '0',
    weeklyAlertUsd: '0',
    monthlyAlertUsd: '0',
  });
  useEffect(() => {
    if (config.data)
      setThresholds({
        dailyAlertUsd: String(config.data.usage.dailyAlertUsd),
        weeklyAlertUsd: String(config.data.usage.weeklyAlertUsd),
        monthlyAlertUsd: String(config.data.usage.monthlyAlertUsd),
      });
  }, [config.data]);
  const daily = report?.daily.slice(-days) ?? [];
  const maxTokens = Math.max(
    1,
    ...daily.map(({ totals }) => (totals.input ?? 0) + (totals.output ?? 0)),
  );
  const maxCost = Math.max(0.0001, ...daily.map(({ totals }) => totals.estimatedCostUsd ?? 0));
  return (
    <section data-testid="usage-panel" className="space-y-4">
      <PageHeader
        title="Usage"
        description="Native provider tokens. Costs are standard API list-price estimates, not billing."
      >
        <Button variant="outline" onClick={() => void usage.refresh()} disabled={usage.busy}>
          <RefreshCw aria-hidden className={usage.busy ? 'animate-spin' : undefined} />
          {usage.busy ? 'Reading...' : 'Refresh'}
        </Button>
      </PageHeader>
      {report?.unknown.map((item) => (
        <p key={`${item.session}:${item.reason}`} className="text-muted-foreground text-sm">
          {item.session}: {item.reason}
        </p>
      ))}
      {report?.alerts.map((alert) => (
        <Card key={alert.period} role="status" className="p-3 text-sm">
          Known estimated {alert.period === 'month' ? 'calendar month' : alert.period} cost{' '}
          {dollars(alert.knownCostUsd)} reached your {dollars(alert.thresholdUsd)} alert. Agents
          keep running.
        </Card>
      ))}
      {report && (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {(
              [
                ['today', 'Today'],
                ['7d', '7 days'],
                ['30d', '30 days'],
                ['90d', '90 days'],
              ] as const
            ).map(([period, label]) => {
              const total = report.periods[period];
              return (
                <Card key={period} className="gap-1 p-4 text-sm">
                  <p className="text-muted-foreground">{label}</p>
                  <p className="font-medium">
                    {tokens(total.input)} input / {tokens(total.output)} output
                  </p>
                  <p>{dollars(total.estimatedCostUsd)} estimated list price</p>
                </Card>
              );
            })}
          </div>
          <Card className="p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h3 className="font-medium">Daily usage (UTC)</h3>
              <div className="flex gap-1">
                {([7, 30, 90] as const).map((count) => (
                  <Button
                    key={count}
                    size="sm"
                    variant={days === count ? 'secondary' : 'ghost'}
                    aria-pressed={days === count}
                    onClick={() => setDays(count)}
                  >
                    {count} days
                  </Button>
                ))}
              </div>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto text-xs">
              {daily.map(({ day, totals }) => (
                <div key={day} className="grid grid-cols-[5.5rem_1fr_1fr] items-center gap-3">
                  <span>{day}</span>
                  <div className="flex items-center gap-2">
                    {totals.input !== null && totals.output !== null && (
                      <progress
                        aria-label={`${day} input and output tokens`}
                        value={totals.input + totals.output}
                        max={maxTokens}
                        className="min-w-0 flex-1 accent-primary"
                      />
                    )}
                    <span className="w-16 text-right">
                      {totals.input === null || totals.output === null
                        ? 'Unknown'
                        : tokens(totals.input + totals.output)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {totals.estimatedCostUsd !== null && (
                      <progress
                        aria-label={`${day} estimated list-price cost`}
                        value={totals.estimatedCostUsd}
                        max={maxCost}
                        className="min-w-0 flex-1 accent-primary"
                      />
                    )}
                    <span className="w-16 text-right">{dollars(totals.estimatedCostUsd)}</span>
                  </div>
                </div>
              ))}
            </div>
          </Card>
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-medium">Provider and model, last 90 days</h3>
            {report.breakdown.map(({ agent, model, totals }) => (
              <p key={`${agent}:${model}`}>
                {agent} / {model}: {tokens(totals.input)} input, {tokens(totals.output)} output,{' '}
                {dollars(totals.estimatedCostUsd)} estimated list price
              </p>
            ))}
          </Card>
        </>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Time</TableHead>
              <TableHead>Session</TableHead>
              <TableHead>Provider / model</TableHead>
              <TableHead>Input</TableHead>
              <TableHead>Output</TableHead>
              <TableHead>Cache read</TableHead>
              <TableHead>Cache write</TableHead>
              <TableHead>Estimated cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {report?.rows.map((row) => (
              <TableRow key={row.id} data-testid="usage-row">
                <TableCell className="whitespace-nowrap text-xs">
                  {new Date(row.at).toLocaleString()}
                </TableCell>
                <TableCell className="font-mono text-xs">{row.session}</TableCell>
                <TableCell className="whitespace-normal text-xs">
                  {row.agent} / {row.model ?? 'unknown model'}
                </TableCell>
                <TableCell>{tokens(row.tokens.input)}</TableCell>
                <TableCell>{tokens(row.tokens.output)}</TableCell>
                <TableCell>{tokens(row.tokens.cacheRead)}</TableCell>
                <TableCell>{tokens(row.tokens.cacheWrite)}</TableCell>
                <TableCell>{dollars(row.estimatedCostUsd)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {report?.rows.length === 0 && (
        <p className="text-muted-foreground text-sm">No qualified native usage yet.</p>
      )}
      {config.data && (
        <Card className="p-4 text-sm">
          <h3 className="font-medium">Estimated cost alerts</h3>
          <p className="text-muted-foreground">
            Informational only. Daily and rolling 7-day periods use UTC; monthly starts on the first
            of the UTC month. Set 0 to turn an alert off.
          </p>
          {(
            [
              ['dailyAlertUsd', 'Daily'],
              ['weeklyAlertUsd', '7 days'],
              ['monthlyAlertUsd', 'Calendar month'],
            ] as const
          ).map(([key, label]) => {
            const amount = Number(thresholds[key]);
            const valid = thresholds[key].trim() !== '' && Number.isFinite(amount) && amount >= 0;
            return (
              <div key={key} className="mt-3 flex items-center gap-2">
                <Label className="w-28" htmlFor={`usage-${key}`}>
                  {label} (USD)
                </Label>
                <Input
                  id={`usage-${key}`}
                  className="max-w-40"
                  type="number"
                  min="0"
                  step="0.01"
                  value={thresholds[key]}
                  aria-invalid={!valid}
                  onChange={(event) =>
                    setThresholds((old) => ({ ...old, [key]: event.target.value }))
                  }
                />
                <Button
                  size="sm"
                  variant="outline"
                  disabled={saving || !valid || amount === config.data?.usage[key]}
                  onClick={() => {
                    setSaving(true);
                    void run('config.set', { path: `usage.${key}`, value: amount })
                      .then(async (result) => {
                        if (result) await Promise.all([config.refresh(), usage.refresh()]);
                      })
                      .finally(() => setSaving(false));
                  }}
                >
                  Save
                </Button>
              </div>
            );
          })}
        </Card>
      )}
    </section>
  );
}
