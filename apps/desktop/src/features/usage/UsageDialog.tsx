import { DollarSign, RefreshCw, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useCommand } from '@/lib/useCommand';
import { CostAlerts } from './CostAlerts';
import { UsageByAgent } from './UsageByAgent';
import { UsageByDay } from './UsageByDay';
import { type ChartDays, type ChartMode, UsageChart } from './UsageChart';
import { UsageScope } from './UsageScope';
import { UsageStatCards } from './UsageStatCards';
import { WeeklyRewind } from './WeeklyRewind';

/** The Usage & Estimated Costs window, over the same `mesa usage` report as the CLI. */
export function UsageDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSession: (id: string) => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-testid="usage-panel"
        showCloseButton={false}
        className="gap-0 overflow-hidden bg-card p-0 sm:max-w-3xl"
      >
        <UsageBody onClose={() => props.onOpenChange(false)} onSession={props.onSession} />
      </DialogContent>
    </Dialog>
  );
}

/** Mounted only while the dialog is open, so the report is read when it is shown. */
function UsageBody(props: { onClose: () => void; onSession: (id: string) => void }) {
  const [session, setSession] = useState('');
  const [days, setDays] = useState<ChartDays>(30);
  const [mode, setMode] = useState<ChartMode>('cost');
  const [retained, setRetained] = useState<string[]>([]);
  const [updated, setUpdated] = useState<Date>();
  const usage = useCommand('usage.list', { session: session || undefined });
  const config = useCommand('config.get');
  const report = usage.data;
  useEffect(() => {
    if (!report) return;
    setUpdated(new Date());
    if (!session) setRetained([...new Set(report.rows.map((row) => row.session))]);
  }, [report, session]);
  return (
    <>
      <div className="flex items-center justify-between border-b p-4">
        <DialogTitle className="flex items-center gap-3 font-semibold">
          <DollarSign aria-hidden className="size-5 text-state-idle" />
          Usage &amp; Estimated Costs
        </DialogTitle>
        <span className="flex items-center gap-1">
          <IconButton
            label="Refresh"
            icon={RefreshCw}
            disabled={usage.busy}
            className={usage.busy ? '[&_svg]:animate-spin' : undefined}
            onClick={() => void usage.refresh()}
          />
          <IconButton label="Close" icon={X} onClick={props.onClose} />
        </span>
      </div>
      <div className="max-h-[70vh] space-y-4 overflow-y-auto p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <DialogDescription className="text-xs">
            Cost values are estimates based on public model list prices, not billing. Usage data
            stays in your profile.
          </DialogDescription>
          <UsageScope value={session} retained={retained} onChange={setSession} />
        </div>
        {report?.unknown.map((item) => (
          <p key={`${item.session}:${item.reason}`} className="text-xs text-muted-foreground">
            {item.session}: {item.reason}
          </p>
        ))}
        {!report && (
          <Muted className="py-12 text-center">
            {usage.busy ? 'Loading cost data...' : 'No usage data found'}
          </Muted>
        )}
        {report && (
          <>
            <UsageStatCards periods={report.periods} />
            <UsageChart report={report} days={days} mode={mode} onDays={setDays} onMode={setMode} />
            <UsageByAgent breakdown={report.breakdown} agents={report.agents} />
            <UsageByDay daily={report.daily.slice(-days)} />
            {config.data && !session && (
              <CostAlerts
                usage={config.data.usage}
                report={report}
                onSaved={async () => {
                  await Promise.all([config.refresh(), usage.refresh()]);
                }}
              />
            )}
            <WeeklyRewind onSession={props.onSession} />
          </>
        )}
      </div>
      <Muted size="xs" className="border-t px-4 py-3 text-center">
        Data from local per-turn session records
        {updated ? `, updated ${updated.toLocaleTimeString()}` : ''}
      </Muted>
    </>
  );
}
