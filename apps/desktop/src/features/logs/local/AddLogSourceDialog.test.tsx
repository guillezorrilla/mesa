// @vitest-environment happy-dom
import { act } from 'react';
import { afterEach, expect, test, vi } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { AddLogSourceDialog } from './AddLogSourceDialog';
import { LOGS_POLL_MS } from './useLogWatch';

afterEach(() => vi.useRealTimers());

const button = (text: string) =>
  [...document.querySelectorAll<HTMLElement>('button')].find((b) => b.textContent?.trim() === text);
const tick = (ms = 10) => act(async () => vi.advanceTimersByTimeAsync(ms));
const choose = (kind: string) =>
  click(document.querySelector<HTMLElement>(`[role="radio"][value="${kind}"]`) ?? undefined);

/** A project whose modules are tide-api and tide-worker, and `written` once its file appears. */
function world(extra: Record<string, (args: string[]) => unknown> = {}) {
  const state = { written: false };
  const { bridge, calls } = fakeBridge({
    'logs sources': () =>
      envelope({
        sources: state.written
          ? [
              {
                id: 'file:tide-api',
                kind: 'file',
                name: 'tide-api',
                detail: '',
                state: 'live',
                lastLine: null,
              },
            ]
          : [],
      }),
    'logs modules': () => envelope({ modules: ['tide-api', 'tide-worker'] }),
    'logs file': (args) =>
      envelope({
        path: `/h/.mesa/default/logs/lantern-cove/${args.at(-1)}.log`,
        source: `file:${args.at(-1)}`,
      }),
    ...extra,
  });
  return { bridge, calls, state };
}

test('JetBrains IDEs: the modules are offered, the path is copied, then it waits for the file and hands it back', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge, calls, state } = world();
  const onFound = vi.fn();
  const byTestId = await renderWithMesa(
    <AddLogSourceDialog project="lantern-cove" onFound={onFound} onClose={() => {}} />,
    bridge,
  );
  await tick(400);
  expect((document.querySelector('#log-service') as HTMLSelectElement).value).toBe('tide-api');
  expect(document.body.textContent).toContain('IntelliJ IDEA, WebStorm, PyCharm, GoLand or Rider');
  expect(document.body.textContent).toContain(
    'Modify options > Logs > Save console output to file',
  );
  const fileCalls = (pathOnly: boolean) =>
    calls.filter((argv) => argv[2] === 'file' && argv.includes('--path-only') === pathOnly);
  expect(fileCalls(true)).toHaveLength(1);
  expect(byTestId('log-file-path')[0]?.textContent).toBe(
    '/h/.mesa/default/logs/lantern-cove/tide-api.log',
  );
  expect(fileCalls(false)).toHaveLength(0);
  await click(button('Copy'));
  expect(fileCalls(false)).toHaveLength(1);
  expect(document.body.textContent).toContain('Waiting for the first line');
  state.written = true;
  await tick(LOGS_POLL_MS + 10);
  expect(onFound).toHaveBeenCalledWith('file:tide-api');
});

test('Terminal or VS Code: the mesa logs run line and a tasks.json task', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge } = world();
  const byTestId = await renderWithMesa(
    <AddLogSourceDialog project="lantern-cove" onFound={() => {}} onClose={() => {}} />,
    bridge,
  );
  await choose('terminal');
  await act(async () => {
    const field = document.querySelector<HTMLInputElement>('#log-command');
    if (!field) throw new Error('no command field');
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(
      field,
      './gradlew bootRun',
    );
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await tick(400);
  expect(byTestId('log-run-line')[0]?.textContent).toBe(
    'mesa logs run tide-api -- ./gradlew bootRun',
  );
  expect(JSON.parse(byTestId('log-run-task')[0]?.textContent ?? '{}')).toEqual({
    label: 'tide-api (logs in Mesa)',
    type: 'shell',
    command: 'mesa logs run tide-api -- ./gradlew bootRun',
    isBackground: true,
    problemMatcher: [],
  });
});

test('Log file: a suggested file is added and handed back; a kept one can be removed', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const { bridge, calls } = world({
    'logs files': () =>
      envelope({
        files: ['/src/lantern-cove/tmp/old.log'],
        suggested: ['/src/lantern-cove/log/development.log'],
      }),
    'logs add': (args) => envelope({ files: ['/src/lantern-cove/tmp/old.log', args.at(-1)] }),
    'logs remove': () => envelope({ files: [] }),
  });
  const onFound = vi.fn();
  await renderWithMesa(
    <AddLogSourceDialog project="lantern-cove" onFound={onFound} onClose={() => {}} />,
    bridge,
  );
  await choose('file');
  await tick();
  await click(button('Remove'));
  expect(calls).toContainEqual([
    '--json',
    'logs',
    'remove',
    '--project',
    'lantern-cove',
    '--',
    '/src/lantern-cove/tmp/old.log',
  ]);
  expect(document.body.textContent).not.toContain('/src/lantern-cove/tmp/old.log');
  await click(button('Add'));
  await tick();
  expect(onFound).toHaveBeenCalledWith('file:/src/lantern-cove/log/development.log');
});
