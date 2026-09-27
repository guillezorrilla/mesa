import type { GuardrailCheck } from '@mesa/core';
import { percent } from '@mesa/core/browser';
import { Play, Send } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';

/** What the guardrail answered when it stopped a command (`guardrail_blocked`); else undefined. */
export const guardrailOf = (error: { code: string; details?: unknown }) =>
  error.code === 'guardrail_blocked' ? (error.details as GuardrailCheck) : undefined;

/** The first letter up. */
const upper = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/** What the guardrail stopped: a row's Send, or a Run skill. Its submit says to do it anyway. */
const ACTIONS = {
  send: { label: 'Send anyway', icon: Send },
  run: { label: 'Run anyway', icon: Play },
};

/**
 * The guardrail's ask on an action's text (a strict project's): why, and the decision behind it,
 * each answer with its probability. Its submit does the same action again with --yes.
 */
export function GuardrailDialog(props: {
  action: keyof typeof ACTIONS;
  /** What waits on it, as the title ends: `this prompt goes to a1b2c3d4`. */
  about: string;
  check: GuardrailCheck;
  disabled: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const { label, icon: Icon } = ACTIONS[props.action];
  const { decision, reason } = props.check;
  const rows = decision.answers.map((a) => {
    const question = decision.questions.find((q) => q.id === a.id);
    if (a.kind === 'Noul') {
      const statement = question?.kind === 'Noul' ? question.statement : a.id;
      return [statement, percent(a.probabilities)];
    }
    return [upper(a.id), `${a.answer}, ${percent(a.confidence)} sure`];
  });
  return (
    <ActionDialog
      testId="guardrail-dialog"
      title={`The guardrail asks before ${props.about}`}
      description={`${upper(reason)}.`}
      submit={{
        label: (
          <>
            <Icon aria-hidden />
            {label}
          </>
        ),
        testId: `guardrail-${props.action}`,
        disabled: props.disabled,
      }}
      onSubmit={props.onConfirm}
      onCancel={props.onCancel}
    >
      <dl
        data-testid="guardrail-decision"
        className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-sm"
      >
        {[...rows, ['Answered by', decision.backend]].map(([label, value]) => (
          <div key={label} className="contents">
            <dt className="text-muted-foreground">{label}</dt>
            <dd className="text-right font-mono tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
    </ActionDialog>
  );
}
