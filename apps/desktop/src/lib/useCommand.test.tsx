// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { deferred, envelope, fakeBridge, PROJECTS, renderWithMesa } from './testing';
import { useCommand } from './useCommand';

test('refresh keeps same-command data and ignores an older reply', async () => {
  const older = deferred();
  const newer = deferred();
  let requests = 0;
  const { bridge } = fakeBridge({
    projects: () => {
      requests++;
      return requests === 1 ? envelope(PROJECTS) : requests === 2 ? older.promise : newer.promise;
    },
  });
  function Projects() {
    const { data, refresh } = useCommand('projects.list');
    return (
      <div>
        <span data-testid="projects">{data?.map((p) => p.name).join(', ')}</span>
        <button type="button" data-testid="refresh" onClick={() => void refresh()}>
          Refresh
        </button>
      </div>
    );
  }
  const byTestId = await renderWithMesa(<Projects />, bridge);
  const names = () => byTestId('projects')[0]?.textContent;
  expect(names()).toBe('lantern-cove, tide');
  await act(async () => byTestId('refresh')[0]?.click());
  expect(names()).toBe('lantern-cove, tide');
  await act(async () => byTestId('refresh')[0]?.click());
  await act(async () => newer.resolve(envelope([PROJECTS[0]])));
  expect(names()).toBe('lantern-cove');
  await act(async () => older.resolve(envelope(PROJECTS)));
  expect(names()).toBe('lantern-cove');
});

test('a screen shown again starts from its last reply while it reloads', async () => {
  const reload = deferred();
  let requests = 0;
  const { bridge } = fakeBridge({
    projects: () => (++requests === 1 ? envelope(PROJECTS) : reload.promise),
  });
  function Projects() {
    const { data, busy } = useCommand('projects.list');
    return (
      <span data-testid="projects" data-busy={busy}>
        {data?.map((p) => p.name).join(', ')}
      </span>
    );
  }
  function Toggle() {
    const [shown, setShown] = useState(true);
    return (
      <>
        <button type="button" data-testid="toggle" onClick={() => setShown((v) => !v)}>
          Toggle
        </button>
        {shown && <Projects />}
      </>
    );
  }
  const byTestId = await renderWithMesa(<Toggle />, bridge);
  expect(byTestId('projects')[0]?.textContent).toBe('lantern-cove, tide');
  await act(async () => byTestId('toggle')[0]?.click());
  await act(async () => byTestId('toggle')[0]?.click());
  // Shown again: the last reply at once, reloading behind it.
  expect(requests).toBe(2);
  expect(byTestId('projects')[0]?.textContent).toBe('lantern-cove, tide');
  expect(byTestId('projects')[0]?.dataset.busy).toBe('true');
  await act(async () => reload.resolve(envelope([PROJECTS[0]])));
  expect(byTestId('projects')[0]?.textContent).toBe('lantern-cove');
});
