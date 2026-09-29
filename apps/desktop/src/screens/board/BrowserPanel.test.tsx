// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import type { BrowserHost } from '@/lib/platform';
import { click, envelope, fakeBridge, fakePlatform, renderWithMesa } from '@/lib/testing';
import { BrowserPanel } from './BrowserPanel';

test('browser annotation previews its target, rechecks the element, and sends once', async () => {
  const picked = {
    url: 'https://example.test/',
    title: 'Example',
    selector: 'h1',
    text: 'Violet otter',
  };
  let current: typeof picked | null = picked;
  let openedBounds: { x: number; y: number; width: number; height: number } | undefined;
  let onLoad: (event: { session: string; url: string }) => void = () => {};
  const browser: BrowserHost = {
    owner: async () => ({ pid: 42, socket: '/tmp/mesa-browser-42.sock' }),
    open: async (session, url, bounds) => {
      openedBounds = bounds;
      onLoad({ session, url });
      return 'browser-test';
    },
    navigate: async (session, url) => onLoad({ session, url }),
    bounds: async () => {},
    close: async () => {},
    probe: async () => ({ url: picked.url, title: picked.title, heading: picked.text }),
    back: async () => {},
    forward: async () => {},
    reload: async () => {},
    pickStart: async () => {},
    pickResult: async () => current,
    onLoad: async (listener) => {
      onLoad = listener;
      return () => {};
    },
  };
  const preview = {
    id: 'annotation-1',
    target: 'aaaaaaaa',
    source: 'page-source',
    revision: 'page-revision',
    passage: picked.text,
    comment: 'Check this.',
    prompt: 'Review this user annotation for https://example.test/',
    url: picked.url,
    selector: picked.selector,
  };
  const { bridge, calls } = fakeBridge({
    'review responses': () => envelope({ rows: [], reviews: [], truncated: false }),
    'browser clear': () => envelope({ cleared: true }),
    'browser select': () => envelope({ source: 'page-source', revision: 'page-revision' }),
    'browser annotate-preview': () => envelope(preview),
    'browser annotate-send': () =>
      envelope({ id: preview.id, target: 'aaaaaaaa', status: 'delivered' }),
  });
  const byTestId = await renderWithMesa(
    <BrowserPanel sessionId="aaaaaaaa" onClose={() => {}} />,
    bridge,
    fakePlatform({ browser }),
  );
  const address = document.querySelector<HTMLInputElement>('[aria-label="Browser address"]');
  if (!address) throw new Error('address missing');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      address,
      picked.url,
    );
    address.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(document.querySelector<HTMLElement>('[aria-label="Go to address"]') ?? undefined);
  expect(openedBounds).toEqual({ x: 0, y: 0, width: 0, height: 0 });
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Pick element'),
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Use selection'),
    ),
  );
  expect(byTestId('browser-selection')[0]?.textContent).toContain('Violet otter');
  expect(calls.some((args) => args[1] === 'browser' && args[2] === 'select')).toBe(true);
  const comment = document.querySelector<HTMLTextAreaElement>('#browser-comment');
  if (!comment) throw new Error('comment missing');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(
      comment,
      'Check this.',
    );
    comment.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Preview annotation'),
    ),
  );
  expect(byTestId('browser-annotation-preview')[0]?.textContent).toContain('aaaaaaaa');
  current = { ...picked, text: 'Changed' };
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Send annotation'),
    ),
  );
  expect(calls.filter((args) => args[1] === 'browser' && args[2] === 'annotate-send')).toHaveLength(
    0,
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Pick element'),
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Use selection'),
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Preview annotation'),
    ),
  );
  await click(
    [...document.querySelectorAll<HTMLElement>('button')].find((button) =>
      button.textContent?.includes('Send annotation'),
    ),
  );
  expect(calls.filter((args) => args[1] === 'browser' && args[2] === 'annotate-send')).toHaveLength(
    1,
  );
  current = { ...picked, text: 'Changed again' };
  await act(async () => new Promise((resolve) => setTimeout(resolve, 650)));
  expect(byTestId('browser-selection')).toHaveLength(0);
  expect(
    calls.filter((args) => args[1] === 'browser' && args[2] === 'clear').length,
  ).toBeGreaterThan(1);
  await act(async () => onLoad({ session: 'aaaaaaaa', url: 'https://example.test/next' }));
  expect(byTestId('browser-selection')).toHaveLength(0);
  expect(calls.some((args) => args[1] === 'browser' && args[2] === 'clear')).toBe(true);
});
