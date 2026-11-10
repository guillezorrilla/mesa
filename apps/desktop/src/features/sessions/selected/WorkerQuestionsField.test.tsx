// @vitest-environment happy-dom
import type { Question } from '@mesa/core';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { WorkerQuestionsField } from './WorkerQuestionsField';

const question = (id: string, text: string): Question => ({
  id,
  parent: 'aaaaaaaa',
  child: 'bbbbbbbb',
  childName: 'tide-charts',
  text,
  at: '2026-09-24T12:00:00.000Z',
});

test("a parent's open worker questions each have a reply box; Send answers it and it leaves", async () => {
  let open = [question('q-7k2m', 'Metres or feet?'), question('q-9p3x', 'Plot the moon?')];
  const { bridge, calls } = fakeBridge({
    reports: () => envelope({ enabled: true, reports: [], questions: open }),
    'reports reply': (args) => {
      const id = args.at(-2);
      open = open.filter((q) => q.id !== id);
      return envelope({ question: { ...question(id ?? '', ''), answer: args.at(-1) } });
    },
  });
  const byTestId = await renderWithMesa(<WorkerQuestionsField session="aaaaaaaa" />, bridge);
  const list = byTestId('session-worker-questions')[0];
  expect(list?.textContent).toContain('tide-charts');
  expect(list?.textContent).toContain('Metres or feet?');
  expect(list?.textContent).toContain('Plot the moon?');
  const input = document.querySelector<HTMLInputElement>('[aria-label="Answer q-7k2m"]');
  await fill(input, 'Metres');
  await click(input?.form?.querySelector<HTMLButtonElement>('button[type="submit"]') ?? undefined);
  expect(calls).toContainEqual(['--json', 'reports', 'reply', '--', 'q-7k2m', 'Metres']);
  expect(byTestId('session-worker-questions')[0]?.textContent).not.toContain('Metres or feet?');
  expect(byTestId('session-worker-questions')[0]?.textContent).toContain('Plot the moon?');
});
