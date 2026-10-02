import { AGENT_LABELS } from '@mesa/core/browser';
import { Plug } from 'lucide-react';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { SettingRow } from '../SettingRow';

/** Mesa's hooks in each agent: what lets it tell when a session needs you. */
export function SessionHooks() {
  const hooks = useCommand('hooks.status');
  const run = useRun();
  const { acting, act } = useAct();
  const agents = hooks.data
    ? ([
        [AGENT_LABELS.claude, hooks.data.installed && !hooks.data.stale],
        [AGENT_LABELS.codex, hooks.data.codex.installed && !hooks.data.codex.stale],
        [
          AGENT_LABELS.antigravity,
          hooks.data.antigravity.installed && !hooks.data.antigravity.stale,
        ],
      ] as const)
    : [];
  const ready = agents.length > 0 && agents.every(([, installed]) => installed);
  return (
    <SettingRow
      icon={Plug}
      title="Session hooks"
      description="Installs hooks into coding agents so Mesa can detect when sessions need attention."
      control={
        <Button
          size="sm"
          variant={ready ? 'ghost' : 'secondary'}
          disabled={acting || !hooks.data}
          onClick={() =>
            void act(async () => {
              const result = await run('hooks.install');
              await hooks.refresh();
              return result && said('Installed session hooks', result);
            })
          }
        >
          {ready ? 'Reinstall' : 'Install hooks'}
        </Button>
      }
    >
      <span className="flex flex-wrap gap-2">
        {agents.map(([agent, installed]) => (
          <span
            key={agent}
            className={cn(
              'rounded-full px-2 py-0.5 text-xs',
              installed ? 'bg-state-idle/15 text-state-idle' : 'bg-accent text-muted-foreground',
            )}
          >
            {agent}: {installed ? 'installed' : 'not installed'}
          </span>
        ))}
      </span>
    </SettingRow>
  );
}
