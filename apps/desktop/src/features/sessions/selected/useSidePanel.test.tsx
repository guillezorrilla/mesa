// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { fakeBridge, renderWithMesa } from '@/lib/testing';
import { useSidePanel } from './useSidePanel';

test('one side panel at a time: opening one closes another, toggling it again closes it', async () => {
  let side: ReturnType<typeof useSidePanel> | undefined;
  function Probe() {
    side = useSidePanel('aaaaaaaa');
    return null;
  }
  await renderWithMesa(<Probe />, fakeBridge().bridge);
  const toggle = (panel: 'review' | 'browser' | 'diff') =>
    act(async () => {
      side?.toggle(panel);
    });
  await toggle('review');
  expect(side?.open).toBe('review');
  await toggle('diff');
  expect(side?.open).toBe('diff');
  await toggle('diff');
  expect(side?.open).toBeUndefined();
});

test('each session keeps its own panel: going back to one reopens what it had open', async () => {
  let side: ReturnType<typeof useSidePanel> | undefined;
  let select: (session: string) => void = () => {};
  function Probe() {
    const [session, setSession] = useState('aaaaaaaa');
    select = setSession;
    side = useSidePanel(session);
    return null;
  }
  await renderWithMesa(<Probe />, fakeBridge().bridge);
  const run = (step: () => void) =>
    act(async () => {
      step();
    });
  await run(() => side?.toggle('diff'));
  await run(() => select('bbbbbbbb'));
  expect(side?.open).toBeUndefined();
  await run(() => select('aaaaaaaa'));
  expect(side?.open).toBe('diff');
});
