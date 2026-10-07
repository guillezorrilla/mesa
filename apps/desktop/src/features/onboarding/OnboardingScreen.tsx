import type { Config, DoctorReport, ProjectRow } from '@mesa/core';
import { PageHeader } from '@/components/PageHeader';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useOpenSettings } from '@/features/settings/useOpenSettings';
import { useAct } from '@/lib/useAct';
import { type CommandState, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { FirstSessionStep } from './FirstSessionStep';
import { ProjectsStep } from './ProjectsStep';
import { RequirementsStep } from './RequirementsStep';
import { SmarterStep } from './SmarterStep';
import { VaultStep } from './VaultStep';

/**
 * The first run, one step at a time: a vault (which creates the profile), what sessions need,
 * the projects, an optional decision model, then a first session. After the vault, the step is `onboarding.step` plus one,
 * so leaving and coming back resumes where it was.
 */
export function OnboardingScreen(props: {
  doctor: CommandState<DoctorReport>;
  config: Config | undefined;
  projects: readonly ProjectRow[];
  onInitialised: () => Promise<void>;
  onConfigChanged: () => Promise<void>;
  onProjectsChanged: () => Promise<void>;
  /** Onboarding is complete: the session it started, or none for the board. */
  onDone: (session?: string) => void;
}) {
  const run = useRun();
  const { act } = useAct();
  const openSettings = useOpenSettings();
  const obsidian = props.doctor.data?.checks.find((c) => c.name === 'obsidian')?.ok ?? true;
  // Each step's title and body, in order; after Vault, the saved `onboarding.step` indexes the rest.
  const steps = [
    {
      title: 'Vault',
      body: () => <VaultStep obsidian={obsidian} onCreated={props.onInitialised} />,
    },
    { title: 'Requirements', body: () => <RequirementsStep doctor={props.doctor} onNext={next} /> },
    {
      title: 'Projects',
      body: () => (
        <ProjectsStep
          registered={props.projects.length}
          onRegistered={props.onProjectsChanged}
          onNext={next}
        />
      ),
    },
    {
      title: 'Make Mesa smarter',
      body: () => (
        <SmarterStep
          modelSet={(props.config?.decisions.model ?? 'none') !== 'none'}
          onOpen={() => openSettings?.('decisions')}
          onNext={next}
        />
      ),
    },
    {
      title: 'First session',
      body: () => (
        <FirstSessionStep
          projects={props.projects}
          doctor={props.doctor.data}
          onDone={props.onDone}
        />
      ),
    },
  ];
  const step = props.config ? Math.min(props.config.onboarding.step + 1, steps.length - 1) : 0;
  const next = () =>
    void act(async () => {
      if (!(await run('config.set', { path: 'onboarding.step', value: step }))) return undefined;
      await props.onConfigChanged();
      return undefined;
    });
  return (
    <section data-testid="onboarding" className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Set up Mesa"
        description="A few steps and your first session is running."
      />
      <ol className="flex gap-2 text-xs" aria-label="Steps">
        {steps.map(({ title }, index) => (
          <li
            key={title}
            aria-current={index === step ? 'step' : undefined}
            className={cn(
              'flex-1 border-t-2 pt-1',
              index <= step ? 'border-primary text-foreground' : 'text-muted-foreground',
            )}
          >
            {index + 1}. {title}
          </li>
        ))}
      </ol>
      <Card>
        <CardHeader>
          <CardTitle data-testid="onboarding-step">{steps[step]?.title}</CardTitle>
        </CardHeader>
        <CardContent>{steps[step]?.body()}</CardContent>
      </Card>
    </section>
  );
}
