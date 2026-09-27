// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { App } from '@/App';
import {
  cells,
  choose,
  click,
  deferred,
  envelope,
  failure,
  fakeBridge,
  guardrailStopped,
  managedRow,
  PROJECTS,
  RUN_RECEIPT,
  receiptAnswers,
  renderWithMesa,
  SKILLS,
  toasts,
} from '@/lib/testing';

/** `mesa run --json` once the run ended: its result, its session, and its receipt. */
const ran = (result: { ok: boolean; reason?: string }) =>
  envelope({
    session: 'eeeeeeee',
    output: result.ok ? 'README tidied' : '',
    agentSessionId: '00000000-0000-4000-8000-000000000005',
    durationMs: 61_000,
    receipt: { id: RUN_RECEIPT.receipt.id, path: RUN_RECEIPT.path },
    ...result,
  });

/** The mesa run calls, without --json. */
const runs = (calls: string[][]) => calls.filter((c) => c[1] === 'run').map((c) => c.slice(1));

const answers = {
  projects: () => envelope(PROJECTS),
  // lantern-cove's own skills; the library's alone without a project.
  'skills list': (args: string[]) => envelope(args.includes('lantern-cove') ? SKILLS : []),
  ...receiptAnswers(),
};

test('Run skill offers the enabled skills of a project whose folder is there', async () => {
  const { bridge, calls } = fakeBridge({ ...answers, run: () => ran({ ok: true }) });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  expect(byTestId('run-skill-dialog')[0]?.dataset.state).toBe('open');
  const projects = [...(byTestId('run-skill-project')[0] as HTMLSelectElement).options];
  expect(projects.map((o) => [o.value, o.disabled])).toEqual([
    ['lantern-cove', false],
    ['tide', true],
  ]);
  const skill = byTestId('run-skill-skill')[0] as HTMLSelectElement;
  expect([...skill.options].map((o) => o.value)).toEqual(['session-summary', 'tidy-readme']);
  expect(byTestId('run-skill-about')[0]?.textContent).toBe(
    'Summarise what a session did into the vault',
  );
  await choose(skill, 'tidy-readme');
  expect(byTestId('run-skill-about')[0]?.textContent).toBe('Tidy the README');
  const codex = byTestId('run-skill-dialog')[0]?.querySelector<HTMLButtonElement>(
    '[role="radio"][value="codex"]',
  );
  expect(codex?.disabled).toBe(false);
  await click(codex ?? undefined);
  await click(byTestId('run-skill-submit')[0]);
  expect(runs(calls)).toContainEqual([
    'run',
    '--project',
    'lantern-cove',
    '--agent',
    'codex',
    '--',
    'tidy-readme',
  ]);
});

test('Run skill offers project-brief and starts it on the selected project', async () => {
  const { bridge, calls } = fakeBridge({
    ...answers,
    'skills list': () =>
      envelope([
        ...SKILLS,
        {
          name: 'project-brief',
          source: 'mesa',
          enabled: true,
          description: 'Describe a registered project',
        },
      ]),
    run: () => ran({ ok: true }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  await choose(byTestId('run-skill-skill')[0], 'project-brief');
  expect(byTestId('run-skill-about')[0]?.textContent).toBe('Describe a registered project');
  await click(byTestId('run-skill-submit')[0]);
  expect(runs(calls)).toEqual([
    ['run', '--project', 'lantern-cove', '--agent', 'claude', '--', 'project-brief'],
  ]);
});

test('changing project hides the old skills while the new list is pending or fails', async () => {
  const next = deferred();
  const { bridge, calls } = fakeBridge({
    ...answers,
    projects: () =>
      envelope([
        ...PROJECTS,
        { ...PROJECTS[0], name: 'harbor-lights', path: '/src/harbor-lights' },
      ]),
    'skills list': (args) => (args.includes('harbor-lights') ? next.promise : envelope(SKILLS)),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  expect((byTestId('run-skill-skill')[0] as HTMLSelectElement).options).toHaveLength(2);

  await choose(byTestId('run-skill-project')[0], 'harbor-lights');
  expect((byTestId('run-skill-skill')[0] as HTMLSelectElement).options).toHaveLength(0);
  expect(byTestId('run-skill-submit')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('run-skill-submit')[0]);
  expect(runs(calls)).toEqual([]);

  await act(async () => next.resolve(failure('skills could not be read')));
  expect((byTestId('run-skill-skill')[0] as HTMLSelectElement).options).toHaveLength(0);
  expect(byTestId('run-skill-submit')[0]?.hasAttribute('disabled')).toBe(true);
  expect(runs(calls)).toEqual([]);
});

test('Run closes the dialog, the Board shows the run while it runs, and its end links to its receipt', async () => {
  vi.useFakeTimers();
  try {
    let started = false;
    let end = (_: unknown) => {};
    const { bridge, calls } = fakeBridge({
      ...answers,
      sessions: () =>
        envelope(
          started
            ? ([
                managedRow('eeeeeeee', { kind: 'run', goal: '/tidy-readme focus on tests' }),
              ] satisfies TreeRow[])
            : [],
        ),
      run: () => {
        started = true;
        return new Promise((done) => (end = done));
      },
    });
    const byTestId = await renderWithMesa(<App />, bridge);
    await click(byTestId('run-skill')[0]);
    await choose(byTestId('run-skill-skill')[0], 'tidy-readme');
    (byTestId('run-skill-args')[0] as HTMLInputElement).value = ' focus on tests ';
    await click(byTestId('run-skill-submit')[0]);
    // The run takes minutes: the dialog is gone at once, and the Board is free meanwhile.
    expect(byTestId('run-skill-dialog')).toEqual([]);
    expect(runs(calls)).toEqual([
      [
        'run',
        '--project',
        'lantern-cove',
        '--agent',
        'claude',
        '--',
        'tidy-readme',
        'focus on tests',
      ],
    ]);
    expect(byTestId('new-session')[0]?.hasAttribute('disabled')).toBe(false);
    await act(async () => vi.advanceTimersByTime(2000));
    expect(byTestId('session-run')).toHaveLength(1);
    expect(toasts(byTestId)).toEqual([]);

    await act(async () => end(ran({ ok: true })));
    expect(toasts(byTestId)).toEqual([
      ['confirmation', 'Ran tidy-readme on lantern-cove as eeeeeeee: done'],
    ]);
    const [link] = byTestId('toast-link');
    expect(link?.textContent).toBe('Open its receipt');
    await click(link);
    expect(byTestId('toast')).toEqual([]);
    expect(byTestId('receipts-screen')).toHaveLength(1);
    expect(byTestId('receipt-details')[0]?.querySelector('h3')?.textContent).toBe(
      RUN_RECEIPT.summary,
    );
    expect(byTestId('decision-row').map(cells)).toEqual([
      ['verdictChoice', 'ask', 'ask 95%', '95%', 'rules'],
      ['secret-or-destructiveNoul', 'no', 'yes 5%', 'none', 'rules'],
    ]);
    expect(byTestId('receipt-frontmatter')[0]?.textContent).toContain('2026-09-25T12:06');
  } finally {
    vi.useRealTimers();
  }
});

test("a failed run's toast is an alert, which stays, and still links to its receipt", async () => {
  const { bridge } = fakeBridge({
    ...answers,
    run: () => ran({ ok: false, reason: 'claude exited with status 1' }),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  await click(byTestId('run-skill-submit')[0]);
  expect(toasts(byTestId)).toEqual([
    [
      'alert',
      'Ran session-summary on lantern-cove as eeeeeeee: failed (claude exited with status 1)',
    ],
  ]);
  expect(byTestId('toast-link')).toHaveLength(1);
});

test("the guardrail's ask on a run opens its dialog; Run anyway runs it again with --yes", async () => {
  const { bridge, calls } = fakeBridge({
    ...answers,
    run: (args) =>
      args.includes('--yes')
        ? ran({ ok: true })
        : guardrailStopped('ask', 'project lantern-cove has guardrail: strict'),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  await click(byTestId('run-skill-submit')[0]);
  const dialog = byTestId('guardrail-dialog')[0];
  expect(dialog?.textContent).toContain(
    'The guardrail asks before /session-summary runs on lantern-cove',
  );
  expect(dialog?.textContent).toContain('Project lantern-cove has guardrail: strict.');
  expect(toasts(byTestId)).toEqual([]);

  await click(byTestId('guardrail-run')[0]);
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(runs(calls)).toEqual([
    ['run', '--project', 'lantern-cove', '--agent', 'claude', '--', 'session-summary'],
    ['run', '--project', 'lantern-cove', '--agent', 'claude', '--yes', '--', 'session-summary'],
  ]);
  expect(toasts(byTestId)).toEqual([
    ['confirmation', 'Ran session-summary on lantern-cove as eeeeeeee: done'],
  ]);
});

test("the guardrail's block on a run is said in the toast, with no way past it in the app", async () => {
  const { bridge, calls } = fakeBridge({
    ...answers,
    run: () => guardrailStopped('block', 'the text holds a destructive command (rm -rf)'),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  (byTestId('run-skill-args')[0] as HTMLInputElement).value = 'then rm -rf /';
  await click(byTestId('run-skill-submit')[0]);
  expect(byTestId('guardrail-dialog')).toEqual([]);
  expect(toasts(byTestId)).toEqual([
    [
      'alert',
      'Did not run session-summary on lantern-cove: the text holds a destructive command (rm -rf)',
    ],
  ]);
  expect(runs(calls)).toHaveLength(1);
});

test('with no skill enabled for the project, Run is off and says why', async () => {
  const { bridge } = fakeBridge({
    ...answers,
    'skills list': () => envelope(SKILLS.map((s) => ({ ...s, enabled: false }))),
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  await click(byTestId('run-skill')[0]);
  expect(byTestId('run-skill-submit')[0]?.hasAttribute('disabled')).toBe(true);
  expect(byTestId('run-skill-about')[0]?.textContent).toBe(
    "No skill is enabled for lantern-cove: add one to the profile's skills or to its mesa.yaml.",
  );
});
