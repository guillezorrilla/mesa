// @vitest-environment happy-dom
import type { DecisionStatus, ScopedContext } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, failure, fakeBridge, renderWithMesa } from '@/lib/testing';
import { DecisionAssistancePanel } from './DecisionAssistancePanel';

const STATUS: DecisionStatus = {
  session: 'aaaaaaaa',
  project: 'lantern-cove',
  model: 'jev',
  off: false,
  sites: [
    {
      site: 'relevance',
      mode: 'automatic',
      acceptAt: 0.5,
      experimental: true,
      measured: { quality: { n: 30, accepted: 28, right: 28 } },
    },
    { site: 'next-step', mode: 'on-demand', acceptAt: 0.5, experimental: true },
    { site: 'evidence', mode: 'on-demand', acceptAt: 0.5 },
  ],
  deadlines: { automatic: 1500, 'on-demand': 10000 },
  packetChars: 4096,
  ready: 2,
  use: [
    {
      at: new Date().toISOString(),
      site: 'relevance',
      mode: 'on-demand',
      status: 'accepted',
      latencyMs: 0,
      cached: true,
    },
    {
      at: new Date().toISOString(),
      site: 'next-step',
      mode: 'on-demand',
      status: 'unavailable',
      latencyMs: 1500,
      reason: 'Jev did not answer within 1500 ms',
    },
  ],
};

const CONTEXT = {
  session: 'aaaaaaaa',
  project: 'lantern-cove',
  query: 'Make the feed import retry',
  required: { goal: 'Make the feed import retry' },
  sources: [
    {
      id: 'note:projects/lantern-cove/retry.md',
      title: 'Retry',
      excerpt: 'Retries go through the helper.',
    },
  ],
  evaluation: { site: 'relevance', mode: 'on-demand', status: 'accepted', latencyMs: 80 },
  advice:
    'Most relevant: note:projects/lantern-cove/retry.md (margin 0.60, jev-1.13.0). Read it before relying on it.',
} satisfies ScopedContext;

const text = (byTestId: (id: string) => HTMLElement[], id: string) =>
  byTestId(id)[0]?.textContent ?? '';

test("the panel shows each site's mode, the deadlines and recent use, turns the session off, and previews its context", async () => {
  let status = STATUS;
  const { bridge, calls } = fakeBridge({
    'decisions status': () => envelope(status),
    'decisions off': () => {
      status = {
        ...status,
        off: true,
        sites: status.sites.map((s) => ({ ...s, mode: 'off' as const })),
      };
      return envelope({ session: 'aaaaaaaa', off: true, changed: true });
    },
    'decisions context': () => envelope(CONTEXT),
  });
  const byTestId = await renderWithMesa(<DecisionAssistancePanel session="aaaaaaaa" />, bridge);
  const panel = text(byTestId, 'session-decisions');
  expect(calls).toContainEqual(['--json', 'decisions', 'status', '--session', 'aaaaaaaa']);
  expect(panel).toContain('Model jev');
  expect(panel).toContain(
    'relevanceAutomatic (experimental)Quality: 100% right where it answered, on 93% of 30 held-out cases. Paired workflows: not measured.',
  );
  expect(panel).toContain('next-stepOn demand (experimental)');
  expect(panel).toContain('evidenceOn demand');
  expect(panel).toContain('Deadlines 1.5 s per turn, 10 s on demand. 2 ready answers');
  expect(text(byTestId, 'session-decision-use')).toBe(
    'now relevance accepted, ready answernow next-step unavailable, 1500 ms: Jev did not answer within 1500 ms',
  );

  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Preview context'),
  );
  expect(calls).toContainEqual(['--json', 'decisions', 'context', '--session', 'aaaaaaaa']);
  expect(text(byTestId, 'session-context-preview')).toBe(
    `${CONTEXT.advice}note:projects/lantern-cove/retry.md`,
  );

  await click(
    document.querySelector<HTMLElement>('[aria-label="Decision assistance for this session"]') ??
      undefined,
  );
  expect(calls).toContainEqual(['--json', 'decisions', 'off', '--session', 'aaaaaaaa']);
  expect(text(byTestId, 'session-decisions')).toContain('relevanceOff');
  expect(
    [...document.querySelectorAll('button')].some((b) => b.textContent === 'Preview context'),
  ).toBe(false);
});

test('with no Decision model the switch is off and disabled; a refused session shows why', async () => {
  const none = fakeBridge();
  const byTestId = await renderWithMesa(
    <DecisionAssistancePanel session="aaaaaaaa" />,
    none.bridge,
  );
  expect(text(byTestId, 'session-decisions')).toContain(
    'Off: no Decision model (Settings > Smarter decisions)',
  );
  const toggle = document.querySelector('[aria-label="Decision assistance for this session"]');
  expect(toggle?.getAttribute('data-state')).toBe('unchecked');
  expect(toggle?.hasAttribute('disabled')).toBe(true);
  expect(none.calls.filter((argv) => argv[2] === 'context')).toEqual([]);

  document.body.innerHTML = '';
  const refused = fakeBridge({
    'decisions status': () =>
      failure('session aaaaaaaa ended at 2026-09-24T13:00:00.000Z', 'usage'),
  });
  await renderWithMesa(<DecisionAssistancePanel session="aaaaaaaa" />, refused.bridge);
  expect(document.body.textContent).toContain('session aaaaaaaa ended at 2026-09-24T13:00:00.000Z');
});
