// @vitest-environment happy-dom
import type { LogSource } from '@mesa/core';
import { act, useState } from 'react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, fill, renderWithMesa } from '@/lib/testing';
import { LogsPanel } from './LogsPanel';
import { CLOSED_POLL_MS, LOGS_POLL_MS, useLogWatch } from './useLogWatch';

// The source the person picked for the project; tests of the picker clear it.
beforeEach(() => localStorage.setItem('mesa.logs.source.lantern-cove', 'docker:harbour-api'));

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const SOURCES: LogSource[] = [
  {
    id: 'docker:harbour-api',
    kind: 'docker',
    name: 'harbour-api',
    detail: 'alpine, Up 1 minute',
    state: 'live',
    lastLine: '2026-05-06T07:08:10Z',
  },
  {
    id: 'session:a1b2c3d4',
    kind: 'session',
    name: 'tide server',
    detail: 'terminal session a1b2c3d4',
    state: 'quiet',
    lastLine: null,
  },
];
const NPE =
  'java.lang.NullPointerException: berth is null\n\tat org.springframework.web.Servlet.run(Servlet.java:1)\n\tat com.example.MooringService.reserve(MooringService.java:88)\n\tat java.base/java.lang.Thread.run(Thread.java:1583)';
const entry = (
  time: string,
  level: 'error' | 'warn' | 'info',
  message: string,
  stack: string | null = null,
) => ({ time, level, message, logger: 'c.e.h.MooringController', stack });

/** The panel over its stream, open or closed, and the dot the session bar would show. */
function Harness(props: {
  send?: (text: string) => boolean;
  start?: (goal: string) => void;
  closed?: boolean;
}) {
  const [open, setOpen] = useState(!props.closed);
  const watch = useLogWatch('lantern-cove', open);
  return (
    <>
      <button type="button" data-testid="toggle" onClick={() => setOpen(!open)} />
      {watch.dot && <span data-testid="dot" />}
      {open && (
        <LogsPanel
          logs={{
            watch,
            takesPrompt: Boolean(props.send),
            send: props.send ?? (() => false),
            start: props.start ?? (() => {}),
            hide: () => {},
          }}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text);
const menuItem = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')].find((item) =>
    item.textContent?.includes(text),
  );
const tick = (ms = 10) => act(async () => vi.advanceTimersByTimeAsync(ms));

function bridgeWith(read: () => ReturnType<typeof entry>[], extra = {}) {
  return fakeBridge({
    'logs sources': () => envelope({ sources: SOURCES }),
    logs: (args) => envelope({ source: args.at(-1), entries: read() }),
    ...extra,
  });
}

test('the picked source streams in: stacks folded to their own frame, picked lines go to the composer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let entries = [
    entry('2026-05-06T07:08:09Z', 'info', 'GET /tides 200 12ms'),
    entry('2026-05-06T07:08:10Z', 'error', 'POST /moorings 500 reqId=7f3a', NPE),
  ];
  const { bridge, calls } = bridgeWith(() => entries);
  const send = vi.fn(() => true);
  await renderWithMesa(<Harness send={send} />, bridge);
  await tick();
  expect(calls).toContainEqual([
    '--json',
    'logs',
    '--project',
    'lantern-cove',
    '--tail',
    '500',
    '--',
    'docker:harbour-api',
  ]);
  expect(rows().map((row) => row.dataset.level)).toEqual(['info', 'error']);
  const error = rows()[1]?.textContent ?? '';
  expect(error).toContain('at com.example.MooringService.reserve(MooringService.java:88)');
  expect(error).not.toContain('Thread.run');
  expect(error).toContain('+2 frames');
  await click(button('+2 frames'));
  expect(rows()[1]?.textContent).toContain('Thread.run');

  entries = [...entries, entry('2026-05-06T07:08:12Z', 'warn', 'slow tide 1.4s')];
  await tick(LOGS_POLL_MS);
  expect(rows()).toHaveLength(3);
  await click(rows()[1]);
  await click(rows()[2]);
  await click(button('Send to agent'));
  const sent = String(send.mock.calls[0]?.at(0));
  expect(sent).toContain('Source: Docker · harbour-api');
  expect(sent).toContain('Request: 7f3a');
  expect(sent).toContain('POST /moorings 500 reqId=7f3a');
  expect(sent).toContain('WARN slow tide 1.4s');

  await click(document.querySelector<HTMLElement>('[aria-label="Log source"]') ?? undefined);
  await click(document.querySelector<HTMLElement>('[data-source="session:a1b2c3d4"]') ?? undefined);
  await tick();
  expect(calls.at(-1)?.at(-1)).toBe('session:a1b2c3d4');
  expect(localStorage.getItem('mesa.logs.source.lantern-cove')).toBe('session:a1b2c3d4');
});

test('a request id filters to its lines, Errors groups identical errors, and Mute hides lines like one', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const entries = [
    entry('2026-05-06T07:08:01Z', 'info', 'GET /actuator/health 200 2ms'),
    entry('2026-05-06T07:08:02Z', 'info', 'POST /moorings reqId=7f3a'),
    entry('2026-05-06T07:08:03Z', 'error', 'POST /moorings 500 reqId=7f3a', NPE),
    entry('2026-05-06T07:08:04Z', 'info', 'GET /actuator/health 200 3ms'),
    entry('2026-05-06T07:08:05Z', 'error', 'POST /moorings 500 reqId=a204', NPE),
  ];
  const { bridge } = bridgeWith(() => entries);
  await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  expect(
    document.querySelector('[data-level="error"] .min-w-0 .text-state-failed')?.textContent,
  ).toBe('500');

  await click(button('reqId=7f3a'));
  expect(rows().map((row) => row.textContent)).toHaveLength(2);
  expect(document.body.textContent).toContain('request 7f3a');
  await click(
    document.querySelector<HTMLElement>('[aria-label="Show every request"]') ?? undefined,
  );
  expect(rows()).toHaveLength(5);

  await click(document.querySelector<HTMLElement>('[role="radio"][value="error"]') ?? undefined);
  const group = button(
    'NullPointerException at MooringService.java:88x2last ' +
      new Date('2026-05-06T07:08:05Z').toLocaleTimeString([], { hour12: false }),
  );
  expect(group).toBeDefined();
  expect(rows()).toHaveLength(0);
  await click(group);
  expect(rows()).toHaveLength(2);

  await click(document.querySelector<HTMLElement>('[role="radio"][value="all"]') ?? undefined);
  await click(
    rows()[0]?.querySelector<HTMLElement>('[aria-label^="Mute lines like this"]') ?? undefined,
  );
  expect(rows()).toHaveLength(3);
  expect(localStorage.getItem('mesa.logs.mutes.lantern-cove')).toBe('["/actuator/health"]');
  await click(document.querySelector<HTMLElement>('[aria-label="Logs menu"]') ?? undefined);
  await click(menuItem('/actuator/health'));
  expect(rows()).toHaveLength(5);
});

test('a session that takes no prompt starts a new one with the lines as its goal', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = bridgeWith(() => [
    entry('2026-05-06T07:08:03Z', 'error', 'POST /moorings 500 reqId=7f3a', NPE),
  ]);
  const start = vi.fn();
  await renderWithMesa(<Harness start={start} />, bridge);
  await tick();
  expect(button('Start a session with these lines')).toBeUndefined();
  await click(rows()[0]);
  expect(button('Start a session with these lines')).toBeDefined();
  await click(document.querySelector<HTMLElement>('[aria-label="More ways to ask"]') ?? undefined);
  await click(menuItem('Find the cause and fix'));
  expect(String(start.mock.calls[0]?.at(0))).toMatch(
    /^Find the cause of the error in these local server log lines, then fix it\.\n\nSource: Docker · harbour-api\nRequest: 7f3a/,
  );
});

test('a new error while the panel is closed lights the dot; showing Errors clears it', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.setItem('mesa.logs.source.lantern-cove', 'docker:harbour-api');
  let entries = [entry('2026-05-06T07:08:10Z', 'error', 'old boom')];
  const { bridge } = bridgeWith(() => entries);
  const byTestId = await renderWithMesa(<Harness send={() => true} />, bridge);
  await click(byTestId('toggle')[0]);
  await tick(CLOSED_POLL_MS);
  expect(byTestId('dot')).toHaveLength(0);
  entries = [...entries, entry('2026-05-06T07:08:20Z', 'error', 'new boom')];
  await tick(CLOSED_POLL_MS);
  expect(byTestId('dot')).toHaveLength(1);
  await click(byTestId('toggle')[0]);
  expect(byTestId('dot')).toHaveLength(1);
  await click(document.querySelector<HTMLElement>('[role="radio"][value="error"]') ?? undefined);
  expect(byTestId('dot')).toHaveLength(0);
});

test('before the panel was ever opened, the dot watches the picked source', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let entries = [entry('2026-05-06T07:08:10Z', 'error', 'old boom')];
  const { bridge, calls } = bridgeWith(() => entries);
  const byTestId = await renderWithMesa(<Harness send={() => true} closed />, bridge);
  await tick();
  expect(calls.at(-1)?.at(-1)).toBe('docker:harbour-api');
  entries = [...entries, entry('2026-05-06T07:08:20Z', 'error', 'new boom')];
  await tick(CLOSED_POLL_MS);
  expect(byTestId('dot')).toHaveLength(1);
});

test('with no source picked, the panel lists the sources and asks, reading nothing until one is picked', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.clear();
  const { bridge, calls } = bridgeWith(() => [entry('2026-05-06T07:08:10Z', 'error', 'boom')]);
  await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  expect(document.body.textContent).toContain('Pick the log source to show for this project.');
  expect(calls.some((args) => args.includes('docker:harbour-api'))).toBe(false);
  await click(
    document.querySelector<HTMLElement>('button[aria-label="Show Docker · harbour-api"]') ??
      undefined,
  );
  await tick();
  expect(localStorage.getItem('mesa.logs.source.lantern-cove')).toBe('docker:harbour-api');
  expect(calls.at(-1)?.at(-1)).toBe('docker:harbour-api');
});

test('a failed sources read says so, not that there are none', async () => {
  const { bridge } = fakeBridge({
    'logs sources': () => ({ ok: false, error: { code: 'internal', message: 'docker ps hung' } }),
  });
  await renderWithMesa(<Harness send={() => true} />, bridge);
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('docker ps hung');
  expect(document.body.textContent).not.toContain('No running containers');
});

test('with no source, the empty state says what to do and opens Add a log source', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = fakeBridge({
    'logs sources': () => envelope({ sources: [] }),
    'logs modules': () => envelope({ modules: [] }),
    'logs file': (args) =>
      envelope({ path: `/h/${args.at(-1)}.log`, source: `file:${args.at(-1)}` }),
  });
  const byTestId = await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  expect(document.body.textContent).toContain(
    'No running containers or server sessions for this project. Start the server with Docker or in a Mesa terminal session, or add a log source.',
  );
  await click(button('Add a log source'));
  expect(byTestId('add-log-source-dialog')).toHaveLength(1);
});
test('Maximize covers the session area and is kept per project; Esc returns', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = bridgeWith(() => [entry('2026-05-06T07:08:03Z', 'info', 'GET /tides 200')]);
  await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  const panel = () => document.querySelector<HTMLElement>('aside[aria-label="Logs"]');
  await click(document.querySelector<HTMLElement>('[aria-label^="Maximize logs"]') ?? undefined);
  expect(panel()?.dataset.maximized).toBe('true');
  expect(localStorage.getItem('mesa.logs.maximized.lantern-cove')).toBe('true');
  await act(async () =>
    panel()?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })),
  );
  expect(panel()?.dataset.maximized).toBeUndefined();
  await act(async () =>
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'M', metaKey: true, shiftKey: true })),
  );
  expect(panel()?.dataset.maximized).toBe('true');
});

test("a row's hover actions copy it, send it alone, and mute lines like it", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = bridgeWith(() => [
    entry('2026-05-06T07:08:03Z', 'error', 'POST /moorings 500 reqId=7f3a'),
  ]);
  const send = vi.fn(() => true);
  await renderWithMesa(<Harness send={send} />, bridge);
  await tick();
  await click(rows()[0]?.querySelector<HTMLElement>('[aria-label="Send to agent"]') ?? undefined);
  expect(String(send.mock.calls[0]?.at(0))).toContain('The lines (1):');
  expect(rows()[0]?.getAttribute('aria-selected')).toBe('false');
  expect(document.querySelector('footer')).toBeNull();
});

test('the level and text filters are kept per project: closing the panel, or a restart, brings them back', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = bridgeWith(() => [
    entry('2026-05-06T07:08:03Z', 'info', 'GET /tides 200'),
    entry('2026-05-06T07:08:04Z', 'error', 'berth is null', NPE),
  ]);
  await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  await click(
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')].find((r) =>
      r.textContent?.includes('Errors'),
    ),
  );
  await fill(
    document.querySelector<HTMLInputElement>('[aria-label="Filter lines"]') ?? undefined,
    'berth',
  );
  expect(localStorage.getItem('mesa.logs.level.lantern-cove')).toBe('error');
  expect(localStorage.getItem('mesa.logs.text.lantern-cove')).toBe('berth');
  // A fresh render, as after a restart: only what was kept comes back.
  await renderWithMesa(<Harness send={() => true} />, bridge);
  await tick();
  expect(document.querySelector<HTMLInputElement>('[aria-label="Filter lines"]')?.value).toBe(
    'berth',
  );
  expect(
    [...document.querySelectorAll<HTMLElement>('[role="radio"]')]
      .find((r) => r.textContent?.includes('Errors'))
      ?.getAttribute('aria-checked'),
  ).toBe('true');
});
