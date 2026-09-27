import type { GuardrailCheck } from '@mesa/core';
import { percent } from '@mesa/core/browser';
import { Send } from 'lucide-react';
import { ActionDialog } from '@/components/ActionDialog';

/** The first letter up. */
const upper = (text: string) => `${text.charAt(0).toUpperCase()}${text.slice(1)}`;

/**
 * The guardrail's ask on a prompt (a strict project's): why, and the decision behind it, each
 * answer with its probability. Send anyway sends the same prompt again with --yes.
 */
export function GuardrailDialog(props: {
  sessionId: string;
  check: GuardrailCheck;
  disabled: boolean;
  onSend: () => void;
  onCancel: () => void;
}) {
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
      title={`The guardrail asks before this prompt goes to ${props.sessionId}`}
      description={`${upper(reason)}.`}
      submit={{
        label: (
          <>
            <Send aria-hidden />
            Send anyway
          </>
        ),
        testId: 'guardrail-send',
        disabled: props.disabled,
      }}
      onSubmit={props.onSend}
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
