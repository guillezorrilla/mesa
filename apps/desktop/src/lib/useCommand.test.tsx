// @vitest-environment happy-dom
import { act } from 'react';
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
