import type { DoctorReport } from '@mesa/core';
import {
  AGENT_CAPABILITIES,
  AGENT_LABELS,
  AGENT_NAMES,
  agentCapabilityReport,
} from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { type CommandState, useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { DoctorChecksPanel } from './DoctorChecksPanel';

/**
 * The doctor state is the App's, so the header's verdict and this screen show the same run. The
 * windows on Mesa's tmux server sit under the checks, and Recheck reruns both.
 */
export function DoctorScreen({ doctor }: { doctor: CommandState<DoctorReport> }) {
  const { data, busy, refresh } = doctor;
  const agents = data ? agentCapabilityReport(data.checks) : undefined;
  const windows = useCommand('windows.list');
  const [eventFilter, setEventFilter] = useState('');
  const diagnostics = useCommand('diagnostics.list', { event: eventFilter });
  useEffect(() => {
    const timer = setInterval(() => void diagnostics.refresh(), 5_000);
    return () => clearInterval(timer);
  }, [diagnostics.refresh]);
  const hooks = useCommand('hooks.status');
  const hooksInstalled =
    hooks.data?.installed &&
    hooks.data.codex?.installed !== false &&
    hooks.data.antigravity?.installed !== false &&
    hooks.data.antigravityVault?.installed !== false &&
    hooks.data.antigravityDecisions?.installed !== false;
  const run = useRun();
  const { acting, act } = useAct();
  const change = (name: 'hooks.install' | 'hooks.uninstall') =>
    act(async () => {
      const changed = await run(name);
      if (!changed) return undefined;
      // The doctor's own hook rows change too.
      await Promise.all([hooks.refresh(), refresh()]);
      return warningOf(changed);
    });
  return (
    <section data-testid="doctor-panel" className="space-y-4">
      <PageHeader title="Doctor" description="What Mesa needs, and whether it has it.">
        <Button
          variant="outline"
          data-testid="doctor-recheck"
          onClick={() => Promise.all([refresh(), windows.refresh(), diagnostics.refresh()])}
          disabled={busy || windows.busy}
        >
          <RefreshCw aria-hidden className={cn(busy && 'animate-spin')} />
          {busy ? 'Checking...' : 'Recheck'}
        </Button>
      </PageHeader>
      <DoctorChecksPanel report={data} onInstalled={refresh} />
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
            {hooks.data?.antigravity && (
              <p data-testid="antigravity-hooks-status" className="mt-3 text-sm">
                Antigravity:{' '}
                {hooks.data.antigravity.installed
                  ? 'Installed'
                  : hooks.data.antigravity.stale
                    ? 'Stale (reinstall)'
                    : 'Not installed'}{' '}
                in <span className="font-mono text-xs">{hooks.data.antigravity.path}</span>
              </p>
            )}
            {hooks.data?.antigravityVault && (
              <p data-testid="antigravity-vault-status" className="mt-3 text-sm">
                Antigravity mesa-vault:{' '}
                {hooks.data.antigravityVault.conflict
                  ? `Conflicting (${hooks.data.antigravityVault.conflict})`
                  : hooks.data.antigravityVault.installed
                    ? hooks.data.antigravityVault.disabled
                      ? 'Disabled in Antigravity'
                      : 'Installed'
                    : hooks.data.antigravityVault.stale
                      ? 'Stale (reinstall)'
                      : hooks.data.antigravityVault.server
                        ? 'Allow rule missing'
                        : 'Not installed'}{' '}
                in <span className="font-mono text-xs">{hooks.data.antigravityVault.path}</span> and{' '}
                <span className="font-mono text-xs">{hooks.data.antigravityVault.rulePath}</span>
              </p>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">tmux windows</CardTitle>
          </CardHeader>
          <CardContent>
            {windows.data?.length === 0 && (
              <Muted data-testid="tmux-none">No windows on Mesa's tmux server.</Muted>
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
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent local diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <Muted size="xs">
            Hook event names only. Provider content stays in local session logs.
          </Muted>
          <Input
            aria-label="Filter diagnostic events"
            placeholder="Filter event name"
            value={eventFilter}
            onChange={(event) => setEventFilter(event.target.value)}
          />
          <Muted size="xs">
            Showing {diagnostics.data?.events.length ?? 0} of {diagnostics.data?.total ?? 0} recent
            matching events, newest first. Refreshes every 5 seconds.
          </Muted>
          <div className="max-h-64 overflow-auto">
            {diagnostics.data?.events.map((item) => (
              <p key={item.id} className="font-mono text-xs">
                {new Date(item.at).toLocaleString()} {item.session} {item.agent} {item.event}
              </p>
            ))}
          </div>
        </CardContent>
      </Card>
    </section>
  );
}
