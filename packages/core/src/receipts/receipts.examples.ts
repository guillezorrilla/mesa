import type { ReceiptInput } from './schema.js';

// One example per receipt type. The golden files in golden/ are these, written by writeReceipt;
// docs/receipts.md shows the same files (a test keeps them in step).
export const EXAMPLES: Record<ReceiptInput['type'], ReceiptInput> = {
  action: {
    type: 'action',
    profile: 'default',
    project: 'lantern-cove',
    status: 'ok',
    command: 'mesa register lantern-cove --create',
    inputs: { dir: '/src/lantern-cove', create: true },
    outputs: { path: '/src/lantern-cove', wroteMesaYaml: true },
    summary: 'Registered project lantern-cove',
  },
  session: {
    type: 'session',
    profile: 'default',
    project: 'lantern-cove',
    session: 'a1b2c3',
    agent: 'claude',
    started: '2026-09-24T09:30',
    ended: '2026-09-24T11:05',
    status: 'ok',
    command: 'mesa open lantern-cove',
    outputs: { turns: 14, lastState: 'done' },
    summary: 'Session a1b2c3 on lantern-cove ended done after 1 h 35 min',
    details: 'Resumed once. Last output: "All tests pass."',
  },
  skill: {
    type: 'skill',
    profile: 'default',
    project: 'lantern-cove',
    agent: 'claude',
    status: 'failed',
    command: 'mesa run lantern-cove --skill tidy-readme',
    inputs: { skill: 'tidy-readme' },
    outputs: { error: 'agent exited with code 1' },
    cost: 0.042,
    summary: 'Skill tidy-readme failed on lantern-cove',
  },
  decision: {
    type: 'decision',
    profile: 'default',
    project: 'lantern-cove',
    session: 'a1b2c3',
    status: 'blocked',
    command: 'mesa send a1b2c3 "git push --force"',
    decisions: [
      {
        question: 'Allow sending this prompt?',
        kind: 'Choice',
        answer: 'block',
        probabilities: { allow: 0.08, ask: 0.22, block: 0.7 },
        confidence: 0.81,
        backend: 'rules',
      },
      {
        question: 'Is the prompt destructive?',
        kind: 'Noul',
        answer: true,
        probabilities: 0.93,
        backend: 'rules',
      },
    ],
    inputs: { prompt: 'git push --force' },
    summary: 'Guardrail blocked a prompt to session a1b2c3',
  },
};
