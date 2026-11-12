import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import type { MacRead } from '../mac/tryCall';
import { RuleForm } from './RuleForm';

/** The form once the Mac named its projects; why not, when it did not answer. */
export function NewRuleBody({ answer }: { answer: Promise<MacRead<CallResult<'automations'>>> }) {
  const { result, error } = use(answer);
  return (
    <Screen className="gap-6" keyboardInsets>
      {error ? <ErrorNote text={error} /> : null}
      {result ? <RuleForm projects={result.projects} /> : null}
    </Screen>
  );
}
