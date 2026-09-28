import type { Check, DoctorReport } from '@mesa/core';
import {
  AGENT_CAPABILITIES,
  AGENT_LABELS,
  AGENT_NAMES,
  agentCapabilityReport,
} from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { warned } from '@/components/Toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useAct } from '@/lib/useAct';
import { type CommandState, useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

const MARK: Record<Check['status'], string> = { ok: '✓', warn: '!', fail: '✗' };
const TONE: Record<Check['status'], string> = {
  ok: 'text-state-idle',
  warn: 'text-state-waiting',
  fail: 'text-state-failed',
};

/**
 * The doctor state is the App's, so the header's verdict and this screen show the same run. The
 * windows on Mesa's tmux server sit under the checks, and Recheck reruns both.
 */
export function DoctorScreen({ doctor }: { doctor: CommandState<DoctorReport> }) {
  const { data, busy, refresh } = doctor;
  const agents = data ? agentCapabilityReport(data.checks) : undefined;
  const windows = useCommand('windows.list');
  const hooks = useCommand('hooks.status');
  const hooksInstalled = hooks.data?.installed && hooks.data.codex?.installed !== false;
  const run = useRun();
  const { acting, act } = useAct();
  const change = (name: 'hooks.install' | 'hooks.uninstall') =>
    act(async () => {
      const changed = await run(name);
      if (!changed) return undefined;
      // The doctor's own hook rows change too.
      await Promise.all([hooks.refresh(), refresh()]);
      return warned(changed.warning);
    });
  return (
    <section data-testid="doctor-panel" className="space-y-4">
      <PageHeader title="Doctor" description="What Mesa needs, and whether it has it.">
        <Button
          variant="outline"
          data-testid="doctor-recheck"
          onClick={() => Promise.all([refresh(), windows.refresh()])}
          disabled={busy || windows.busy}
        >
          <RefreshCw aria-hidden className={cn(busy && 'animate-spin')} />
          {busy ? 'Checking...' : 'Recheck'}
        </Button>
      </PageHeader>
      {data && !data.healthy && (
        <Alert variant="destructive">
          <AlertDescription data-testid="doctor-summary">{data.summary}</AlertDescription>
        </Alert>
      )}
      <Card className="py-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Check</TableHead>
              <TableHead>OK</TableHead>
              <TableHead>Version</TableHead>
              <TableHead>Hint</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data?.checks.map((c) => (
              <TableRow key={c.name} data-testid="doctor-row" data-status={c.status}>
                <TableCell className="font-medium">{c.name}</TableCell>
                <TableCell aria-label={c.status} className={cn('font-mono', TONE[c.status])}>
                  {MARK[c.status]}
                </TableCell>
                <TableCell className="font-mono text-xs">{c.version ?? ''}</TableCell>
                <TableCell className="whitespace-normal text-muted-foreground text-xs">
                  {c.hint}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Card>
      {agents && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Coding agents</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            {AGENT_NAMES.map((agent) => {
              const row = agents[agent];
              const operations = Object.entries(AGENT_CAPABILITIES[agent]).filter(
                (entry): entry is [string, boolean] => typeof entry[1] === 'boolean',
              );
              return (
                <div key={agent} data-testid="agent-capability">
                  <p className="font-medium">{AGENT_LABELS[agent]}</p>
                  <p className="text-muted-foreground">
                    {row.installed
                      ? `Installed ${row.version ?? 'version unknown'}`
                      : 'Not installed'}
                    {row.installed && !row.matchesVerifiedVersion
                      ? `; differs from tested ${row.verifiedVersion}`
                      : ''}
                    .
                  </p>
                  <p className="text-muted-foreground">
                    Qualified on {row.verifiedVersion}:{' '}
                    {operations
                      .filter(([, supported]) => supported)
                      .map(([name]) => name)
                      .join(', ')}
                    . Unsupported natively:{' '}
                    {operations
                      .filter(([, supported]) => !supported)
                      .map(([name]) => name)
                      .join(', ') || 'none'}
                    .
                  </p>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Agent hooks</CardTitle>
          </CardHeader>
          <CardContent>
            {hooks.data && (
              <p data-testid="hooks-status" className="text-sm">
                {hooks.data.installed
                  ? 'Installed'
                  : hooks.data.stale
                    ? 'Stale (reinstall)'
                    : 'Not installed'}{' '}
                in <span className="font-mono text-xs">{hooks.data.path}</span>{' '}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  data-testid={hooksInstalled ? 'hooks-uninstall' : 'hooks-install'}
                  onClick={() => change(hooksInstalled ? 'hooks.uninstall' : 'hooks.install')}
                  disabled={hooks.busy || acting}
                >
                  {hooksInstalled ? 'Uninstall' : 'Install'}
                </Button>
              </p>
            )}
            {hooks.data?.codex && (
              <div data-testid="codex-hooks-status" className="mt-3 text-sm">
                <p>
                  Codex: <span className="font-mono text-xs">{hooks.data.codex.path}</span>
                </p>
                <ul>
                  {Object.entries(hooks.data.codex.events).map(([event, installed]) => (
                    <li key={event}>
                      {event}:{' '}
                      {!installed
                        ? 'Not installed'
                        : hooks.data?.codex.trusted[event]
                          ? 'Trusted'
                          : 'Untrusted'}
                    </li>
                  ))}
                </ul>
                <p>{hooks.data.codex.hint}</p>
              </div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">tmux windows</CardTitle>
          </CardHeader>
          <CardContent>
            {windows.data?.length === 0 && (
              <p data-testid="tmux-none" className="text-muted-foreground text-sm">
                No windows on Mesa's tmux server.
              </p>
            )}
            <ul className="space-y-1 font-mono text-xs">
              {windows.data?.map((w) => (
                <li key={`${w.project}:${w.window}`} data-testid="tmux-window">
                  {w.project}:{w.window} {w.dead ? '(exited)' : w.command} {w.path}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
