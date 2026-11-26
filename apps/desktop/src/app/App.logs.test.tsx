// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, managedRow, PROJECTS, renderWithMesa } from '@/lib/testing';
import { App } from './App';

const logsButton = () =>
  document.querySelector<HTMLElement>('[aria-pressed][title^="The output of"]');

function bridgeFor(logsPanel: boolean) {
  return fakeBridge({
    resize: (args) => envelope({ session: args[3], target: 'x', cols: 80, rows: 24 }),
    projects: () => envelope(PROJECTS.map((project) => ({ ...project, logsPanel }))),
    sessions: () => envelope([managedRow('aaaaaaaa')]),
    'logs sources': () =>
      envelope({
        sources: [
          {
            id: 'docker:harbour-api',
            kind: 'docker',
            name: 'harbour-api',
            detail: 'alpine, Up',
            state: 'live',
            lastLine: null,
          },
        ],
      }),
    logs: () =>
      envelope({
        source: 'docker:harbour-api',
        entries: [
          {
            time: '2026-05-06T07:08:10Z',
            level: 'error',
            message: 'POST /moorings 500',
            logger: null,
            stack: null,
          },
        ],
      }),
  });
}

test("Logs opens beside a project's session; Send to agent fills its prompt field, unsent, without opening its menu", async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  try {
    const { bridge, calls } = bridgeFor(true);
    await renderWithMesa(<App />, bridge);
    await click(logsButton() ?? undefined);
    await act(async () => vi.advanceTimersByTimeAsync(10));
    expect(document.querySelector('[aria-label="Logs"]')).not.toBeNull();
    // No source picked for the project yet: the panel asks, and the person picks one.
    await click(
      document.querySelector<HTMLElement>('button[aria-label="Show Docker · harbour-api"]') ??
        undefined,
    );
    await act(async () => vi.advanceTimersByTimeAsync(10));
    await click(
      document.querySelector<HTMLElement>('[role="option"][data-level="error"]') ?? undefined,
    );
    await click(
      [...document.querySelectorAll<HTMLElement>('button')].find((b) =>
        b.textContent?.includes('Send to agent'),
      ),
    );
    const field = document.querySelector<HTMLTextAreaElement>('[aria-label="Prompt for aaaaaaaa"]');
    expect(field?.value).toContain('Source: Docker · harbour-api');
    // The field is filled where it is, its menu left closed; the toast offers to show it.
    expect(field?.closest('details')?.open).toBe(false);
    expect(document.body.textContent).toContain('Added the lines to the prompt');
    expect(field?.value).toContain('POST /moorings 500');
    expect(calls.some((argv) => argv[1] === 'send')).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

test('a project with logs.panel false shows no Logs button', async () => {
  const { bridge } = bridgeFor(false);
  await renderWithMesa(<App />, bridge);
  expect(document.querySelector('[data-testid="selected-session"]')).not.toBeNull();
  expect(logsButton()).toBeNull();
});
