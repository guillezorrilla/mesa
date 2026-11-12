import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { PendingRunCard } from './PendingRunCard';
import { RuleList } from './RuleList';
import { RunList } from './RunList';

/** What the Mac answered: waiting runs first, then the rules, then what ran; a failure says why. */
export function AutomationsBody({
  answer,
  onChanged,
}: {
  answer: Promise<MacRead<CallResult<'automations'>>>;
  onChanged: () => void;
}) {
  const { result, error } = use(answer);
  const pending = result?.runs.filter((run) => run.status === 'pending') ?? [];
  const sentenceOf = (name: string) => result?.rules.find((rule) => rule.name === name)?.sentence;
  return (
    <Screen className="gap-6">
      {error ? <ErrorNote text={error} /> : null}
      {result && !result.installed ? (
        <Text variant="muted">
          The scheduler is not installed on your Mac, so no rule runs. Install it from Mesa's
          Automations on the Mac.
        </Text>
      ) : null}
      {pending.length ? (
        <Section title="Waiting for you">
          {pending.map((run) => (
            <PendingRunCard
              key={run.id}
              run={run}
              sentence={sentenceOf(run.rule)}
              onDone={onChanged}
            />
          ))}
        </Section>
      ) : null}
      {result ? (
        <>
          <Section title="Rules">
            <RuleList rules={result.rules} onChanged={onChanged} />
          </Section>
          <Section title="Recent runs">
            <RunList runs={result.runs.filter((run) => run.status !== 'pending')} />
          </Section>
        </>
      ) : null}
    </Screen>
  );
}
