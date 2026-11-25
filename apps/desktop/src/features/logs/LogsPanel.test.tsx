// @vitest-environment happy-dom
import { act, useState } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { choose, click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { LogsPanel } from './LogsPanel';
import { CLOSED_POLL_MS, LOGS_POLL_MS, useLogWatch } from './useLogWatch';

afterEach(() => {
  vi.useRealTimers();
  localStorage.clear();
});

const SOURCES = [
  { id: 'docker:harbour-api', kind: 'docker', name: 'harbour-api', detail: 'alpine, Up 1 minute' },
  {
    id: 'session:a1b2c3d4',
    kind: 'session',
    name: 'tide server',
    detail: 'terminal session a1b2c3d4',
  },
];
const entry = (
  time: string,
  level: 'error' | 'warn' | 'info',
  message: string,
  stack: string | null = null,
) => ({
  time,
  level,
  message,
  stack,
});

/** The panel over its stream, open or closed, and the dot the session bar would show. */
function Harness(props: { onSend: (text: string) => boolean; closed?: boolean }) {
  const [open, setOpen] = useState(!props.closed);
  const watch = useLogWatch('lantern-cove', open);
  return (
    <>
      <button type="button" data-testid="toggle" onClick={() => setOpen(!open)} />
      {watch.dot && <span data-testid="dot" />}
      {open && (
        <LogsPanel
          watch={watch}
          onSend={props.onSend}
          onHide={() => {}}
          onClose={() => setOpen(false)}
        />
      )}
    </>
  );
}

test('the picked source streams in, errors tinted with their stack; picked lines go to the composer', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let entries = [
    entry('2026-05-06T07:08:09Z', 'info', 'GET /tides 200'),
    entry('2026-05-06T07:08:10Z', 'error', 'POST /moorings 500', '    at moor (src/dock.ts:88:31)'),
  ];
  const { bridge, calls } = fakeBridge({
    'logs sources': () => envelope({ sources: SOURCES }),
    logs: (args) => envelope({ source: args.at(-1), entries }),
  });
  const onSend = vi.fn(() => true);
  const byTestId = await renderWithMesa(<Harness onSend={onSend} />, bridge);
  await act(async () => vi.advanceTimersByTimeAsync(10));
  const rows = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
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
  expect(rows()[1]?.textContent).toContain('at moor (src/dock.ts:88:31)');

  entries = [...entries, entry('2026-05-06T07:08:12Z', 'warn', 'slow tide')];
  await act(async () => vi.advanceTimersByTimeAsync(LOGS_POLL_MS));
  expect(rows()).toHaveLength(3);
  await click(rows()[1]);
  await click(rows()[2]);
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent?.includes('Send to agent')),
  );
  expect(onSend).toHaveBeenCalledWith(
    expect.stringMatching(
      /^These lines from the harbour-api \(Docker\) log:\n```\n.*POST \/moorings 500\n {4}at moor.*\n.*WARN slow tide\n```\n$/,
    ),
  );

  await choose(
    document.querySelector('[aria-label="Log source"]') as HTMLElement,
    'session:a1b2c3d4',
  );
  await act(async () => vi.advanceTimersByTimeAsync(10));
  expect(calls.at(-1)?.at(-1)).toBe('session:a1b2c3d4');
  expect(localStorage.getItem('mesa.logs.source.lantern-cove')).toBe('session:a1b2c3d4');
  expect(byTestId('dot')).toHaveLength(0);
});

test('a new error while the panel is closed lights the dot; showing Errors clears it', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  localStorage.setItem('mesa.logs.source.lantern-cove', 'docker:harbour-api');
  let entries = [entry('2026-05-06T07:08:10Z', 'error', 'old boom')];
  const { bridge } = fakeBridge({
    'logs sources': () => envelope({ sources: SOURCES }),
    logs: (args) => envelope({ source: args.at(-1), entries }),
  });
  const byTestId = await renderWithMesa(<Harness onSend={() => true} />, bridge);
  await click(byTestId('toggle')[0]);
  await act(async () => vi.advanceTimersByTimeAsync(CLOSED_POLL_MS));
  expect(byTestId('dot')).toHaveLength(0);
  entries = [...entries, entry('2026-05-06T07:08:20Z', 'error', 'new boom')];
  await act(async () => vi.advanceTimersByTimeAsync(CLOSED_POLL_MS));
  expect(byTestId('dot')).toHaveLength(1);
  await click(byTestId('toggle')[0]);
  expect(byTestId('dot')).toHaveLength(1);
  await click(document.querySelector<HTMLElement>('[role="radio"][value="error"]') ?? undefined);
  expect(byTestId('dot')).toHaveLength(0);
});

test('before the panel was ever opened, the dot watches the first source', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let entries = [entry('2026-05-06T07:08:10Z', 'error', 'old boom')];
  const { bridge, calls } = fakeBridge({
    'logs sources': () => envelope({ sources: SOURCES }),
    logs: (args) => envelope({ source: args.at(-1), entries }),
  });
  const byTestId = await renderWithMesa(<Harness onSend={() => true} closed />, bridge);
  await act(async () => vi.advanceTimersByTimeAsync(10));
  expect(calls.at(-1)?.at(-1)).toBe('docker:harbour-api');
  entries = [...entries, entry('2026-05-06T07:08:20Z', 'error', 'new boom')];
  await act(async () => vi.advanceTimersByTimeAsync(CLOSED_POLL_MS));
  expect(byTestId('dot')).toHaveLength(1);
});

test('a failed sources read says so, not that there are none', async () => {
  const { bridge } = fakeBridge({
    'logs sources': () => ({ ok: false, error: { code: 'internal', message: 'docker ps hung' } }),
  });
  await renderWithMesa(<Harness onSend={() => true} />, bridge);
  expect(document.querySelector('[role="alert"]')?.textContent).toBe('docker ps hung');
  expect(document.body.textContent).not.toContain('No running containers');
});

test('with no source, the empty state says what to do and opens the IntelliJ steps', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let written = false;
  const { bridge, calls } = fakeBridge({
    'logs sources': () =>
      envelope({
        sources: written
          ? [{ id: 'file:lantern-cove', kind: 'file', name: 'lantern-cove', detail: 'log file' }]
          : [],
      }),
    'logs file': () =>
      envelope({
        path: '/h/.mesa/default/logs/lantern-cove/lantern-cove.log',
        source: 'file:lantern-cove',
      }),
    logs: (args) =>
      envelope({
        source: args.at(-1),
        entries: [entry('2026-01-02T10:11:12.345Z', 'error', 'boom')],
      }),
  });
  const byTestId = await renderWithMesa(<Harness onSend={() => true} />, bridge);
  await act(async () => vi.advanceTimersByTimeAsync(10));
  expect(document.body.textContent).toContain(
    'No running containers or server sessions for this project. Start the server with Docker or in a Mesa terminal session, or show IntelliJ logs.',
  );
  await click(
    [...document.querySelectorAll('button')].find(
      (b) => b.textContent?.trim() === 'Show IntelliJ logs',
    ),
  );
  await act(async () => vi.advanceTimersByTimeAsync(400));
  const fileCalls = (pathOnly: boolean) =>
    calls.filter((argv) => argv[2] === 'file' && argv.includes('--path-only') === pathOnly);
  expect(fileCalls(true)).toHaveLength(1);
  expect(byTestId('intellij-log-path')[0]?.textContent).toBe(
    '/h/.mesa/default/logs/lantern-cove/lantern-cove.log',
  );
  // Only a copied path makes the folder and starts the wait.
  expect(fileCalls(false)).toHaveLength(0);
  expect(document.body.textContent).not.toContain('Waiting for IntelliJ');
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === 'Copy'),
  );
  expect(fileCalls(false)).toHaveLength(1);
  expect(document.body.textContent).toContain('Waiting for IntelliJ to write the first line');
  written = true;
  await act(async () => vi.advanceTimersByTimeAsync(LOGS_POLL_MS + 10));
  expect(byTestId('intellij-logs-dialog')).toHaveLength(0);
  expect(localStorage.getItem('mesa.logs.source.lantern-cove')).toBe('file:lantern-cove');
  expect(document.querySelectorAll('[role="option"][data-level="error"]')).toHaveLength(1);
});
