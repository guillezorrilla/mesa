import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { execRunner } from '../process.js';
import { redactPayload } from '../sessions/events.js';
import { fixedClock, scriptedRunner } from '../testing.js';
import {
  ADAPTER_TIMEOUT_MS,
  adapterArgs,
  adapterBackend,
  adapterPrompt,
  answerSchema,
} from './adapter.js';
import { decide, type FaroProfile } from './decide.js';
import { rulesBackend } from './rules.js';
import type { Decision, Question } from './types.js';

// MESA_RECORD_FIXTURES=1 pnpm exec vitest run packages/core/src/decisions/adapter.test.ts runs
// the real `claude -p` (a logged-in Claude Code) and rewrites fixtures/adapter/; every other run
// replays them, offline and key-free. (`pnpm test -- adapter` does not filter: it runs every
// file, and a loaded machine can push a call past the 20 s timeout.)
const RECORD = process.env.MESA_RECORD_FIXTURES === '1';
const dir = join(import.meta.dirname, 'fixtures/adapter');
const HOME = '/Users/avery';
const redact = (value: unknown, maxString?: number) =>
  redactPayload(value, HOME, ['sk-invented-0000'], maxString);
const profile: FaroProfile = {
  decisions: { backend: 'adapter', threshold: 0.7 },
  hasKey: () => false,
};

const STATES = ['working', 'waiting-permission', 'waiting-question', 'idle', 'done', 'failed'];
const board: Question[] = [
  { kind: 'Choice', id: 'state', options: STATES },
  { kind: 'Score', id: 'attention', levels: ['none', 'low', 'medium', 'high', 'urgent'] },
  { kind: 'Noul', id: 'human', statement: 'A human is needed now' },
];
const screen = (lines: string[]) => lines.join('\n');
const cases: {
  name: string;
  state: unknown;
  questions: Question[];
  check: (d: Decision) => void;
}[] = [
  {
    name: 'tail-permission',
    state: {
      agent: 'claude',
      tail: screen([
        ' Bash command',
        '   rm -rf build',
        ' Do you want to proceed?',
        ' ❯ 1. Yes',
        '   2. Yes, and always allow access to /Users/avery/src/lantern-cove from this project',
        '   3. No',
        ' Esc to cancel · Tab to amend',
      ]),
    },
    questions: board,
    check: (d) =>
      expect(d.answers).toMatchObject([
        { answer: 'waiting-permission' },
        { kind: 'Score' },
        { kind: 'Noul', answer: true },
      ]),
  },
  {
    name: 'tail-thinking',
    state: {
      agent: 'claude',
      tail: screen([
        '⏺ Reading 3 files…',
        '',
        '✻ Pondering… (41s · ↓ 2.3k tokens · esc to interrupt)',
      ]),
    },
    questions: board,
    check: (d) =>
      expect(d.answers).toMatchObject([
        { answer: 'working' },
        { kind: 'Score' },
        // A working session needs nobody: the Noul leans no.
        { kind: 'Noul', answer: false },
      ]),
  },
  {
    name: 'route-link',
    state: { text: 'https://example.com/posts/tide-tables, save this for later' },
    questions: [
      { kind: 'Choice', id: 'route', options: ['ingest', 'ask', 'ignore'] },
      { kind: 'Noul', id: 'url', statement: 'The text contains a link' },
    ],
    check: (d) => {
      expect(d.answers[0]).toMatchObject({ answer: 'ingest' });
      expect(d.answers[1]).toMatchObject({ answer: true });
    },
  },
];

test.each(cases)(
  'adapter fixture $name: the recorded claude -p reply parses into the Decision',
  async ({ name, state, questions, check }) => {
    const file = join(dir, `${name}.json`);
    const args = adapterArgs(adapterPrompt(state, questions, redact), questions);
    if (RECORD) {
      const res = await execRunner('claude', args, ADAPTER_TIMEOUT_MS);
      if (!res.ok) throw new Error(`claude -p failed: ${res.reason} ${res.detail}`);
      // The account's session and message ids are replaced: fixtures hold invented ids only.
      const stdout = JSON.stringify({
        ...JSON.parse(res.stdout),
        session_id: '00000000-0000-4000-8000-000000000000',
        uuid: '00000000-0000-4000-8000-000000000001',
      });
      writeFileSync(
        file,
        `${JSON.stringify({ request: { args }, response: { stdout } }, null, 2)}\n`,
      );
    }
    const fixture = JSON.parse(readFileSync(file, 'utf8'));
    const { run, calls } = scriptedRunner({ claude: () => fixture.response.stdout });
    const decision = await decide(
      {
        backends: [rulesBackend([]), adapterBackend({ run, redact })],
        profile,
        clock: fixedClock(),
      },
      state,
      questions,
    );
    // The same request as recorded, with the 20 s timeout.
    expect(calls).toEqual([{ file: 'claude', args: fixture.request.args, timeoutMs: 20_000 }]);
    expect(fixture.request.args).toEqual(args);
    expect(decision.backend).toBe('adapter');
    expect(decision.costUsd).toBeGreaterThan(0);
    check(decision);
  },
  RECORD ? 60_000 : 5_000,
);

test('the request: claude -p, JSON out, the schema, haiku, no tools, nothing persisted', () => {
  const args = adapterArgs('the prompt', board);
  expect(args).toEqual([
    '-p',
    'the prompt',
    '--output-format',
    'json',
    '--json-schema',
    JSON.stringify(answerSchema(board)),
    '--model',
    'haiku',
    '--tools',
    '',
    '--no-session-persistence',
    '--strict-mcp-config',
  ]);
  const schema = answerSchema(board);
  expect(schema.required).toEqual(['state', 'attention', 'human']);
  expect(schema.properties.state).toMatchObject({
    properties: { answer: { enum: STATES }, confidence: { minimum: 0, maximum: 1 } },
    required: ['answer', 'probabilities', 'confidence'],
  });
  expect(schema.properties.attention?.properties.probabilities).toMatchObject({
    required: ['none', 'low', 'medium', 'high', 'urgent'],
  });
  expect(schema.properties.human).toMatchObject({
    properties: { answer: { type: 'boolean' }, confidence: { minimum: 0, maximum: 1 } },
  });
});

test('the tail is redacted, then cut to its last 2000 characters, before it reaches the prompt', () => {
  const tail = `${'x'.repeat(3000)}\n/Users/avery/src/lantern-cove key sk-invented-0000 end`;
  const prompt = adapterPrompt({ tail, cwd: '/Users/avery/src', token: 'abc' }, board, redact);
  const shown = JSON.parse(prompt.slice(prompt.indexOf('{')));
  expect(shown.tail).toHaveLength(2000);
  expect(shown.tail.endsWith('~/src/lantern-cove key *** end')).toBe(true);
  expect(shown).toMatchObject({ cwd: '~/src', token: '***' });
  expect(prompt).not.toContain('/Users/avery');
  expect(prompt).not.toContain('sk-invented-0000');
});

test('a missing claude, a timeout, a failed or unreadable reply fall back to rules', async () => {
  const replies = [
    scriptedRunner({}, { missing: ['claude'] }).run,
    scriptedRunner({}, { slow: ['claude'] }).run,
    scriptedRunner({}, { failing: ['claude'] }).run,
    scriptedRunner({ claude: 'not json' }).run,
    scriptedRunner({ claude: JSON.stringify({ is_error: true, result: 'overloaded' }) }).run,
    scriptedRunner({
      claude: JSON.stringify({ is_error: false, structured_output: { state: {} } }),
    }).run,
  ];
  for (const run of replies) {
    const decision = await decide(
      {
        backends: [rulesBackend([]), adapterBackend({ run, redact })],
        profile,
        clock: fixedClock(),
      },
      {},
      board,
    );
    expect(decision.backend).toBe('rules-fallback');
    expect(decision).not.toHaveProperty('costUsd');
  }
});
