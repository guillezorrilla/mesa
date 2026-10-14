// @vitest-environment happy-dom
import type { ImpactReport, Moment, SessionImpact } from '@mesa/core';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, impactReport, renderWithMesa } from '@/lib/testing';
import { NavigateContext } from '@/lib/useNavigate';
import { ImpactScreen } from './ImpactScreen';
import { MesasPartField } from './MesasPartField';

const moment = (n: number, over: Partial<Moment> = {}): Moment => ({
  id: `m${n}`,
  at: `2026-10-13T0${n}:00:00.000Z`,
  site: 'supervision',
  question: 'What state is this session in?',
  title: 'Saw it was waiting on your answer',
  by: 'clef',
  confidence: 0.82,
  rulesAlone: 'idle',
  outcome: { kind: 'answered', minutes: 2, text: 'You answered 2 min later' },
  ...over,
});

const CHECKOUT: SessionImpact = {
  id: 'a1b2c3d4',
  name: 'checkout-retry',
  project: 'lantern-cove',
  model: 'clef',
  moments: [
    moment(1),
    moment(2, {
      site: 'relevance',
      title: 'Brought wiki/decisions/retry-policy.md into the prompt',
      question: 'Which vault note helps this prompt?',
      rulesAlone: undefined,
      outcome: null,
    }),
  ],
  folded: { agreed: 38, unsure: 4, failed: 0, skipped: 0 },
};
const RATES: SessionImpact = {
  id: 'e5f6a7b8',
  name: 'rate-limits',
  project: 'harbor',
  moments: [1, 2, 3, 4, 5].map((n) => moment(n, { id: `r${n}`, title: `Moment ${n}` })),
  folded: { agreed: 0, unsure: 0, failed: 0, skipped: 0 },
};

const report = (over: Partial<ImpactReport> = {}): ImpactReport =>
  impactReport({
    summary: { caught: 6, corrected: 0, notesIn: 1, stopped: 0, kept: 0, sessions: 2 },
    sentence:
      'In the last 7 days, Mesa caught 6 questions the rules missed and brought 1 vault note into prompts, across 2 sessions.',
    sessions: [CHECKOUT, RATES],
    ...over,
  });

/** A segmented control's option by its words. */
const option = (name: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find(
    (el) => el.textContent === name,
  );

const impactCalls = (calls: string[][]) => calls.filter((c) => c[1] === 'impact');
const texts = (els: HTMLElement[]) => els.map((el) => el.textContent ?? '');

test('Impact shows the sentence, a card per session with its thread, rows and folded line, and switches period', async () => {
  const { bridge, calls } = fakeBridge({
    impact: (args) => envelope(report({ days: args.includes('30') ? 30 : 7 })),
  });
  const onSession = vi.fn();
  const byTestId = await renderWithMesa(<ImpactScreen onSession={onSession} />, bridge);
  expect(byTestId('impact-summary')[0]?.textContent).toContain(
    'Mesa caught 6 questions the rules missed',
  );
  const [checkout, rates] = byTestId('impact-session');
  expect(checkout?.querySelectorAll('[data-testid="impact-thread"] span')).toHaveLength(2);
  expect(checkout?.textContent).toContain('Saw it was waiting on your answer');
  expect(checkout?.textContent).toContain('CLEF 82%');
  expect(checkout?.textContent).toContain('Rules alone: idle');
  expect(checkout?.textContent).toContain('You answered 2 min later');
  expect(checkout?.textContent).toContain('No outcome yet');
  expect(checkout?.textContent).toContain('+ 38 checks where CLEF agreed with the rules, 4 unsure');
  // Five Moments: the newest three until Show all.
  expect(rates?.querySelectorAll('li')).toHaveLength(3);
  await click(
    [...(rates?.querySelectorAll('button') ?? [])].find((b) => b.textContent === 'Show all 5'),
  );
  expect(byTestId('impact-session')[1]?.querySelectorAll('li')).toHaveLength(5);
  await click(
    [...(checkout?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'checkout-retry',
    ),
  );
  expect(onSession).toHaveBeenCalledWith('a1b2c3d4');

  await click(option('Last 30 days'));
  expect(impactCalls(calls).at(-1)).toEqual(['--json', 'impact', '--days', '30']);
});

test('with no Moments Impact says what will appear', async () => {
  const empty =
    'Nothing yet. Moments appear when Mesa catches a question, brings a note in, stops a command or keeps a note.';
  const { bridge } = fakeBridge({
    impact: () => envelope(report({ sentence: empty, sessions: [] })),
  });
  const byTestId = await renderWithMesa(<ImpactScreen />, bridge);
  expect(byTestId('impact-summary')[0]?.textContent).toBe(empty);
  expect(byTestId('impact-session')).toHaveLength(0);
});

test('from a project it opens scoped to it with a switch to the profile; a session comes first and open', async () => {
  const { bridge, calls } = fakeBridge({ impact: () => envelope(report()) });
  const byTestId = await renderWithMesa(
    <ImpactScreen project="lantern-cove" session="e5f6a7b8" />,
    bridge,
  );
  expect(impactCalls(calls)[0]).toEqual([
    '--json',
    'impact',
    '--days',
    '7',
    '--project',
    'lantern-cove',
  ]);
  const [first] = byTestId('impact-session');
  expect(first?.getAttribute('aria-label')).toBe('rate-limits');
  expect(first?.querySelectorAll('li')).toHaveLength(5);
  await click(option('Profile'));
  expect(impactCalls(calls).at(-1)).toEqual(['--json', 'impact', '--days', '7']);
});

test("Mesa's part lists a session's newest three Moments and opens its thread", async () => {
  const { bridge, calls } = fakeBridge({ impact: () => envelope(report({ sessions: [RATES] })) });
  const navigate = vi.fn();
  const byTestId = await renderWithMesa(
    <NavigateContext.Provider value={navigate}>
      <MesasPartField session="e5f6a7b8" />
    </NavigateContext.Provider>,
    bridge,
  );
  expect(impactCalls(calls)[0]).toEqual(['--json', 'impact', '--session', 'e5f6a7b8']);
  const field = byTestId('session-mesas-part')[0];
  expect(texts([...(field?.querySelectorAll<HTMLElement>('li') ?? [])])).toEqual([
    'Moment 5 · You answered 2 min later',
    'Moment 4 · You answered 2 min later',
    'Moment 3 · You answered 2 min later',
  ]);
  await click(
    [...(field?.querySelectorAll('button') ?? [])].find(
      (b) => b.textContent === 'See the whole thread',
    ),
  );
  expect(navigate).toHaveBeenCalledWith({ kind: 'impact', session: 'e5f6a7b8' });

  const none = fakeBridge({ impact: () => envelope(report({ sessions: [] })) });
  const again = await renderWithMesa(<MesasPartField session="a1b2c3d4" />, none.bridge);
  expect(again('session-mesas-part').at(-1)?.textContent).toBe('Nothing yet');
});
