import type { Config } from '@mesa/core';
import { PageHeader } from '@/components/PageHeader';
import { warned } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

const steps = [
  {
    title: 'Projects and sessions',
    body: 'Register a project, then open a Claude Code or Codex session. The Sessions view keeps live terminals beside their project, and Projects shows worktrees and repository files.',
  },
  {
    title: 'Search and context',
    body: 'Search across projects and sessions from the top bar. In a project, contextual decisions and vault changes are available beside the work, while Faro keeps the evidence behind its judgments.',
  },
  {
    title: 'Your Obsidian vault',
    body: 'Mesa keeps its memory in your local Obsidian vault. Open it from Mesa when you want to read or edit notes. The vault stays under your control.',
  },
] as const;

/** A saved, optional walkthrough: no project import or agent launch occurs here. */
export function TourScreen(props: {
  state: Config['onboarding'];
  onChanged: () => void;
  onFinish: () => void;
  onNavigate: (kind: 'projects' | 'board') => void;
  onSearch: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const step = Math.min(props.state.step, steps.length - 1);
  const move = (next: number) =>
    void act(async () => {
      if (!(await run('config.set', { path: 'onboarding.step', value: next }))) return undefined;
      props.onChanged();
      return undefined;
    });
  const finish = () =>
    void act(async () => {
      if (!(await run('config.set', { path: 'onboarding.status', value: 'complete' })))
        return undefined;
      props.onChanged();
      props.onFinish();
      return undefined;
    });
  return (
    <section data-testid="welcome-tour" className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Welcome to Mesa"
        description={`Step ${step + 1} of ${steps.length}. You can leave and resume this tour later.`}
      />
      <Card>
        <CardHeader>
          <CardTitle>{steps[step]?.title}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm leading-relaxed">{steps[step]?.body}</p>
          {step === 0 && (
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => props.onNavigate('projects')}>
                Open Projects
              </Button>
              <Button variant="outline" onClick={() => props.onNavigate('board')}>
                Open Sessions
              </Button>
            </div>
          )}
          {step === 1 && (
            <Button variant="outline" onClick={props.onSearch}>
              Search Mesa
            </Button>
          )}
          {step === 2 && (
            <Button
              variant="outline"
              onClick={() => void act(async () => warned((await run('vault.open'))?.warning))}
            >
              Open in Obsidian
            </Button>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center justify-between gap-2">
        <Button variant="ghost" disabled={acting} onClick={finish}>
          Skip tour
        </Button>
        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="outline" disabled={acting} onClick={() => move(step - 1)}>
              Back
            </Button>
          )}
          <Button
            disabled={acting}
            onClick={step === steps.length - 1 ? finish : () => move(step + 1)}
          >
            {step === steps.length - 1 ? 'Finish' : 'Next'}
          </Button>
        </div>
      </div>
    </section>
  );
}
