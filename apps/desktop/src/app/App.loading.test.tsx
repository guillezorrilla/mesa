// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import {
  deferred,
  envelope,
  failure,
  fakeBridge,
  managedRow,
  PROJECTS,
  renderWithMesa,
} from '@/lib/testing';
import { App } from './App';

// The loading screen at launch: it holds the window until the first view is chosen.

const loading = () => document.querySelector('[role="status"][aria-label="Loading Mesa"]');
/** The workspace is shown: its title bar is in the document and not inside a hidden ancestor. */
const workspaceShown = () => {
  const title = document.querySelector('[data-testid="app-name"]');
  return !!title && !title.closest('[hidden]');
};
/** The empty Board: the start composer, with no session selected. */
const emptyBoardShown = () =>
  workspaceShown() && !!document.querySelector('[data-testid="session-start"]');

test('the loading screen holds until config and the session tree answer, then the first live session shows with no empty Board between', async () => {
  const config = deferred();
  const sessions = deferred();
  const healthy = await fakeBridge().bridge(['--json', 'config']);
  const { bridge } = fakeBridge({
    config: () => config.promise,
    projects: () => envelope(PROJECTS),
    sessions: () => sessions.promise,
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(loading()).not.toBeNull();
  expect(workspaceShown()).toBe(false);
  // Each settled DOM is what the next frame paints: none of them may be the empty Board.
  const boards: boolean[] = [];
  const observer = new MutationObserver(() => boards.push(emptyBoardShown()));
  observer.observe(document.body, { subtree: true, childList: true, attributes: true });
  await act(async () => config.resolve(healthy));
  expect(loading()).not.toBeNull();
  await act(async () => sessions.resolve(envelope([managedRow('aaaaaaaa')])));
  observer.disconnect();
  expect(loading()).toBeNull();
  expect(byTestId('selected-session')).toHaveLength(1);
  expect(boards).not.toContain(true);
});

test('a missing profile goes from the loading screen straight to onboarding', async () => {
  const missing = failure('config.yaml not found; run mesa init --vault <path>');
  const { bridge } = fakeBridge({ config: () => missing, projects: () => missing });
  const byTestId = await renderWithMesa(<App />, bridge);
  expect(loading()).toBeNull();
  expect(workspaceShown()).toBe(true);
  expect(byTestId('onboarding')).toHaveLength(1);
});

test('with no live session the loading screen gives way to the Board', async () => {
  const { bridge } = fakeBridge({ projects: () => envelope(PROJECTS) });
  await renderWithMesa(<App />, bridge);
  expect(loading()).toBeNull();
  expect(emptyBoardShown()).toBe(true);
});

test.each([
  ['config', { config: () => failure('config.yaml is not valid YAML', 'internal') }],
  ['projects', { projects: () => failure('projects.yaml is unreadable', 'internal') }],
  ['sessions', { sessions: () => failure('tmux is not answering', 'internal') }],
])(
  'a %s read that fails gives way to the workspace rather than loading forever',
  async (_, answers) => {
    const { bridge } = fakeBridge(answers);
    await renderWithMesa(<App />, bridge);
    expect(loading()).toBeNull();
    expect(workspaceShown()).toBe(true);
  },
);
