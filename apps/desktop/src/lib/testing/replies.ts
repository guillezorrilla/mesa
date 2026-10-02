import type { GuardrailCheck } from '@mesa/core';

export const envelope = (data: unknown) => ({ ok: true, data });

/** A bridge reply a screen test can complete after a newer request. */
export const deferred = () => {
  let resolve!: (value: unknown) => void;
  const promise = new Promise<unknown>((done) => {
    resolve = done;
  });
  return { promise, resolve };
};

export const failure = (message: string) => ({ ok: false, error: { code: 'not_found', message } });

/** The envelope `mesa send --json` or `mesa run --json` prints when the guardrail stops its text. */
export const guardrailStopped = (verdict: 'ask' | 'block', reason: string) => ({
  ok: false,
  error: {
    code: 'guardrail_blocked',
    message: reason,
    details: {
      verdict,
      reason,
      decision: {
        questions: [
          { kind: 'Choice', id: 'verdict', options: ['allow', 'ask', 'block'] },
          {
            kind: 'Noul',
            id: 'secret-or-destructive',
            statement: 'This text contains a secret or a destructive instruction',
          },
        ],
        answers: [
          {
            id: 'verdict',
            kind: 'Choice',
            answer: verdict,
            probabilities: { allow: 0.04, ask: 0.95, block: 0.01 },
            confidence: 0.95,
          },
          {
            id: 'secret-or-destructive',
            kind: 'Noul',
            answer: verdict === 'block',
            probabilities: verdict === 'block' ? 0.95 : 0.05,
          },
        ],
        backend: 'rules',
        at: '2026-09-25T12:00:00.000Z',
        latencyMs: 0,
      },
    } satisfies GuardrailCheck,
  },
});
