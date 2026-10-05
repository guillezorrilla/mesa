import type { DoctorReport } from '@mesa/core';
import { AGENT_EXECUTABLES } from '@mesa/core/browser';
import { Check, Plug, RefreshCw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { DoctorChecksPanel } from '@/features/doctor/DoctorChecksPanel';
import { hooksReady } from '@/features/doctor/hookAgents';
import { useAct } from '@/lib/useAct';
import { type CommandState, useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

/** The doctor rows a session needs: tmux and the agents, each named by its executable. */
const NEEDED: readonly string[] = ['tmux', ...Object.values(AGENT_EXECUTABLES)];

/**
 * What sessions need: tmux and an agent, each installable here, then Mesa's hooks, which the
 * person installs with a click since they change the agents' own settings. Skip for now leaves
 * the hooks for Settings.
 */
export function RequirementsStep(props: {
  doctor: CommandState<DoctorReport>;
  onNext: () => void;
}) {
  const { doctor } = props;
  const hooks = useCommand('hooks.status');
  const run = useRun();
  const { acting, act } = useAct();
  const report = doctor.data && {
    ...doctor.data,
    checks: doctor.data.checks.filter((check) => NEEDED.includes(check.name)),
  };
  const ready = hooksReady(hooks.data);
  const healthy = doctor.data?.healthy ?? false;
  const install = () =>
    act(async () => {
      const result = await run('hooks.install');
      // The doctor's hook rows, and Notifications' notice from them, change too.
      await Promise.all([hooks.refresh(), doctor.refresh()]);
      return result && warningOf(result);
    });
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <Muted>Sessions run in tmux with Claude Code or Codex. You need tmux and one agent.</Muted>
        <Button
          variant="outline"
          size="sm"
          data-testid="onboarding-recheck"
          disabled={doctor.busy}
          onClick={() => void doctor.refresh()}
        >
          <RefreshCw aria-hidden className={cn(doctor.busy && 'animate-spin')} />
          {doctor.busy ? 'Checking...' : 'Recheck'}
        </Button>
      </div>
      <DoctorChecksPanel report={report} onInstalled={doctor.refresh} />
      <Card>
        <CardContent className="flex items-start justify-between gap-4">
          <div className="space-y-1">
            <p className="flex items-center gap-2 font-medium">
              <Plug aria-hidden className="size-4" /> Session hooks
            </p>
            <Muted>
              Adds status hooks to Claude Code and Codex settings so the board knows when a session
              needs you.
            </Muted>
          </div>
          {ready ? (
            <span
              data-testid="hooks-ready"
              className="flex items-center gap-1 text-sm text-state-idle"
            >
              <Check aria-hidden className="size-4" /> Installed
            </span>
          ) : (
            <Button
              data-testid="onboarding-install-hooks"
              disabled={acting || !hooks.data}
              onClick={() => void install()}
            >
              Install hooks
            </Button>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-end gap-2">
        {healthy && !ready && (
          <Button variant="ghost" data-testid="onboarding-skip-hooks" onClick={props.onNext}>
            Skip for now
          </Button>
        )}
        <Button
          data-testid="onboarding-continue"
          disabled={!healthy || !ready}
          onClick={props.onNext}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
