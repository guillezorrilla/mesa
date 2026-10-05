import type { Agent, DoctorReport, ProjectRow } from '@mesa/core';
import { AGENT_LABELS, AGENT_NAMES, agentCapabilityReport } from '@mesa/core/browser';
import { Play } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { NativeSelect } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/**
 * The first session: a project and an installed agent, Claude when both are, then Start session,
 * which completes onboarding and opens it. I'll do it later completes it and opens the board.
 */
export function FirstSessionStep(props: {
  projects: readonly ProjectRow[];
  doctor: DoctorReport | undefined;
  onDone: (session?: string) => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const report = props.doctor ? agentCapabilityReport(props.doctor.checks) : undefined;
  const agents = AGENT_NAMES.filter((agent) => report?.[agent]?.installed);
  const projects = props.projects.filter((p) => p.exists);
  const [project, setProject] = useState<string>();
  const [agent, setAgent] = useState<Agent>();
  const chosenProject = project ?? projects[0]?.name;
  const chosenAgent = agent ?? agents[0];
  const finish = (start: boolean) =>
    act(async () => {
      const opened = start
        ? await run('sessions.open', { project: chosenProject, agent: chosenAgent })
        : undefined;
      if (start && !opened) return undefined;
      await run('config.set', { path: 'onboarding.status', value: 'complete' });
      props.onDone(opened?.id);
      return undefined;
    });
  return (
    <div className="space-y-4">
      <Muted>Start a coding agent in one of your projects. It opens in a live terminal.</Muted>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label htmlFor="onboarding-project">Project</Label>
          <NativeSelect
            id="onboarding-project"
            value={chosenProject ?? ''}
            onChange={(event) => setProject(event.target.value)}
          >
            {projects.map((p) => (
              <option key={p.name} value={p.name}>
                {p.label}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="space-y-1">
          <Label htmlFor="onboarding-agent">Agent</Label>
          <NativeSelect
            id="onboarding-agent"
            value={chosenAgent ?? ''}
            onChange={(event) => setAgent(event.target.value as Agent)}
          >
            {agents.map((a) => (
              <option key={a} value={a}>
                {AGENT_LABELS[a]}
              </option>
            ))}
          </NativeSelect>
        </div>
      </div>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="ghost"
          data-testid="onboarding-later"
          disabled={acting}
          onClick={() => void finish(false)}
        >
          I'll do it later
        </Button>
        <Button
          data-testid="onboarding-start"
          disabled={acting || !chosenProject || !chosenAgent}
          onClick={() => void finish(true)}
        >
          <Play aria-hidden /> Start session
        </Button>
      </div>
    </div>
  );
}
