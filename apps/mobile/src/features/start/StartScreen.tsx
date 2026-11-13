import { Suspense } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { ChoiceChips } from '@/components/ChoiceChips';
import { FormField } from '@/components/FormField';
import { KeyboardScreen } from '@/components/KeyboardScreen';
import { Screen } from '@/components/Screen';
import { AfterField } from './AfterField';
import { FromCard } from './FromCard';
import { GoalField } from './GoalField';
import { PlaceField } from './PlaceField';
import { ProjectField } from './ProjectField';
import { StartBar } from './StartBar';
import { AGENT_CHOICES } from './startForm';
import { useStart } from './useStart';

/**
 * A new session on the Mac: a project, a goal (saved prompts, a kept draft), the agent, where it
 * runs and what it waits for; from a ticket when `from` names one. Start asks to confirm.
 */
export function StartScreen(props: { project?: string; from?: string; title?: string }) {
  const start = useStart(props);
  const { form, change } = start;
  return (
    <KeyboardScreen
      bar={
        <StartBar
          line={start.line}
          ready={start.ready}
          starting={start.starting}
          outcome={start.outcome}
          onStart={start.confirm}
          onStartAnyway={start.startAnyway}
        />
      }
    >
      <Screen className="gap-6">
        {props.title ? <FromCard title={props.title} /> : null}
        <Suspense fallback={<BusyLine label="Asking for your projects..." />}>
          <ProjectField
            projects={start.projects}
            value={form.project}
            locked={Boolean(props.from)}
            onChange={(project) =>
              change({ project, checkout: undefined, after: 'none', afterTitle: undefined })
            }
          />
        </Suspense>
        <GoalField goal={start.goal} onChange={start.setGoal} optional={Boolean(props.from)} />
        <FormField label="Agent">
          <ChoiceChips
            label="Agent"
            choices={AGENT_CHOICES}
            value={form.agent}
            onChange={(agent) => change({ agent })}
          />
        </FormField>
        <PlaceField form={form} onChange={change} />
        <Suspense fallback={null}>
          <AfterField
            sessions={start.sessions}
            project={form.project}
            value={form.after}
            onChange={(after, afterTitle) => change({ after, afterTitle })}
          />
        </Suspense>
      </Screen>
    </KeyboardScreen>
  );
}
