// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, fakePlatform, renderWithMesa } from '@/lib/testing';
import { LogsPanel } from './LogsPanel';
import { useLogWatch } from './useLogWatch';

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const STACK = [
  'java.lang.NullPointerException: berth is null',
  '\tat org.springframework.web.Servlet.run(Servlet.java:1)',
  '\tat com.example.MooringService.reserve(MooringService.java:88)',
  '\tat java.base/java.lang.Thread.run(Thread.java:1583)',
].join('\n');
const entries = [
  {
    time: '2026-05-06T07:08:09Z',
    level: 'error',
    message: 'POST /moorings 500 reqId=7f3a',
    logger: null,
    stack: STACK,
  },
  { time: '2026-05-06T07:08:10Z', level: 'warn', message: 'slow tide', logger: null, stack: null },
];

function Harness() {
  const watch = useLogWatch('lantern-cove', true);
  return (
    <LogsPanel
      logs={{ watch, takesPrompt: true, send: () => true, start: () => {}, hide: () => {} }}
      onClose={() => {}}
    />
  );
}

async function render() {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = fakeBridge({
    'logs sources': () =>
      envelope({
        sources: [
          {
            id: 'docker:harbour-api',
            kind: 'docker',
            name: 'harbour-api',
            detail: '',
            state: 'live',
            lastLine: null,
          },
        ],
      }),
    logs: (args) => envelope({ source: args.at(-1), entries }),
  });
  const platform = fakePlatform();
  await renderWithMesa(<Harness />, bridge, platform);
  await act(async () => vi.advanceTimersByTimeAsync(10));
  return platform.pasteboard;
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const menuItem = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find(
    (item) => item.textContent?.trim() === text,
  );

test("a row's Copy puts the error ready to paste, with its full stack; its menu copies JSON", async () => {
  const pasteboard = await render();
  const copy = [...(rows()[0]?.querySelectorAll<HTMLElement>('button') ?? [])].find(
    (b) => b.textContent === 'Copy',
  );
  await click(copy);
  expect(pasteboard.at(-1)).toBe(
    [
      '```',
      'ERROR 2026-05-06T07:08:09Z · Docker · harbour-api',
      'POST /moorings 500 reqId=7f3a',
      STACK,
      'request: 7f3a',
      '```',
    ].join('\n'),
  );
  expect(document.body.textContent).toContain('Copied the line');
  await click(
    rows()[0]?.querySelector<HTMLElement>('[aria-label="More ways to copy"]') ?? undefined,
  );
  await click(menuItem('As JSON'));
  expect(JSON.parse(pasteboard.at(-1) ?? '{}')).toMatchObject({ level: 'error', stack: STACK });
});

test('Mod+C copies the picked lines; the footer Copy does too; a group copies its summary', async () => {
  const pasteboard = await render();
  await click(rows()[0]);
  await click(rows()[1]);
  await act(async () =>
    rows()[1]?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'c', metaKey: true, bubbles: true }),
    ),
  );
  expect(pasteboard.at(-1)).toContain('ERROR 2026-05-06T07:08:09Z');
  expect(pasteboard.at(-1)).toContain(
    'WARN 2026-05-06T07:08:10Z · Docker · harbour-api\nslow tide',
  );
  await click(
    document.querySelector<HTMLElement>('footer [aria-label="More ways to copy"]') ?? undefined,
  );
  await click(menuItem('Message only'));
  expect(pasteboard.at(-1)).toBe('POST /moorings 500 reqId=7f3a\nslow tide');

  await click(document.querySelector<HTMLElement>('[role="radio"][value="error"]') ?? undefined);
  await click(
    document.querySelector<HTMLElement>('[aria-expanded] ~ div [aria-label="More ways to copy"]') ??
      undefined,
  );
  await click(menuItem('Copy summary'));
  expect(pasteboard.at(-1)?.split('\n')[0]).toBe(
    'NullPointerException at MooringService.java:88 (x1)',
  );
});
