// @vitest-environment happy-dom

import { expect, test } from 'vitest';
import {
  click,
  envelope,
  fakeBridge,
  managedRow,
  PROJECTS,
  renderWithMesa,
  toasts,
} from '@/lib/testing';
import { App } from './App';

const ID = 'aaaaaaaa';
/** The session an unarchive with --resume starts. */
const RESUMED = 'bbbbbbbb';
const NAME = 'Fix the tide alarm';
const ARCHIVED_AT = '2026-10-03T12:00:00.000Z';
/** The session once archived: ended, with no window. */
const ended = managedRow(ID, {
  name: NAME,
  alive: false,
  endedAt: ARCHIVED_AT,
  lastState: { state: 'done', confidence: 1, at: ARCHIVED_AT, source: 'mesa' },
});

/**
 * One live session in lantern-cove, which `archive` archives and `unarchive --resume` reopens
 * as a new live session in the same project.
 */
async function setup() {
  let state: 'live' | 'archived' | 'resumed' | 'removed' = 'live';
  const { bridge, calls } = fakeBridge({
    projects: () => envelope(PROJECTS),
    sessions: () =>
      envelope(
        state === 'live'
          ? [managedRow(ID, { name: NAME })]
          : state === 'resumed'
            ? [managedRow(RESUMED, { name: NAME, resumedFrom: ID })]
            : [],
      ),
    'sessions --archived': () =>
      envelope(state === 'archived' ? [{ ...ended, archivedAt: ARCHIVED_AT }] : []),
    archive: () => {
      state = 'archived';
      return envelope({ ...ended, archivedAt: ARCHIVED_AT, receipt: null });
    },
    unarchive: () => {
      state = 'resumed';
      return envelope({
        ...ended,
        resumedBy: RESUMED,
        resumed: managedRow(RESUMED, { name: NAME, resumedFrom: ID }),
        receipt: null,
      });
    },
    rm: () => {
      state = 'removed';
      return envelope({ id: ID, removed: true });
    },
  });
  const byTestId = await renderWithMesa(<App />, bridge);
  const archiveFromCard = async () => {
    await click(
      document.querySelector<HTMLElement>(`[aria-label="Archive ${NAME} (${ID})"]`) ?? undefined,
    );
    await click(byTestId('archive-confirm')[0]);
  };
  const count = () => byTestId('archived-toggle')[0]?.textContent;
  /** The resumed session's card, which shows it as the selected session. */
  const resumedCard = () =>
    document.querySelector<HTMLElement>(
      `[data-testid="sidebar-session"][data-session-id="${RESUMED}"]`,
    );
  return { byTestId, calls, archiveFromCard, count, resumedCard };
}

test('an archived session is found under Archived, and its Unarchive resumes it into its project group', async () => {
  const { byTestId, calls, archiveFromCard, count, resumedCard } = await setup();
  expect(count()).toBe('Archived0');
  await archiveFromCard();
  expect(calls).toContainEqual(['--json', 'archive', '--', ID]);
  expect(byTestId('sidebar-session')).toHaveLength(0);

  // Folded by default, with its count.
  expect(count()).toBe('Archived1');
  expect(byTestId('archived-toggle')[0]?.getAttribute('aria-expanded')).toBe('false');
  expect(byTestId('archived-session')).toHaveLength(0);
  await click(byTestId('archived-toggle')[0]);
  const [row] = byTestId('archived-session');
  expect(row?.textContent).toMatch(new RegExp(`^${NAME}lantern-cove, archived .+ ago$`));

  await click(row?.querySelector<HTMLElement>('[aria-label="Unarchive"]') ?? undefined);
  expect(calls).toContainEqual(['--json', 'unarchive', '--resume', '--', ID]);
  expect(toasts(byTestId)).toContainEqual(['confirmation', `Unarchived ${NAME}`]);
  expect(count()).toBe('Archived0');
  // Live again in lantern-cove's group, and shown.
  const group = resumedCard()?.closest<HTMLElement>('[data-testid="sidebar-project-group"]');
  expect(group?.dataset.project).toBe('lantern-cove');
  expect(resumedCard()?.getAttribute('aria-current')).toBe('page');
});

test("archiving from a card's X toasts a confirmation whose Undo unarchives and resumes it", async () => {
  const { byTestId, calls, archiveFromCard, count, resumedCard } = await setup();
  await archiveFromCard();
  expect(toasts(byTestId)).toContainEqual(['confirmation', `Archived ${NAME}`]);
  const undo = byTestId('toast-link')[0];
  expect(undo?.textContent).toBe('Undo');
  await click(undo);
  expect(calls).toContainEqual(['--json', 'unarchive', '--resume', '--', ID]);
  expect(toasts(byTestId)).toContainEqual(['confirmation', `Unarchived ${NAME}`]);
  expect(count()).toBe('Archived0');
  expect(resumedCard()?.getAttribute('aria-current')).toBe('page');
});

test('Delete permanently confirms with the Remove dialog, then runs mesa rm', async () => {
  const { byTestId, calls, archiveFromCard, count } = await setup();
  await archiveFromCard();
  await click(byTestId('archived-toggle')[0]);
  await click(
    byTestId('archived-session')[0]?.querySelector<HTMLElement>(
      '[aria-label="Delete permanently"]',
    ) ?? undefined,
  );
  expect(byTestId('remove-dialog')).toHaveLength(1);
  expect(calls.some((args) => args[1] === 'rm')).toBe(false);
  await click(byTestId('remove-confirm')[0]);
  expect(calls).toContainEqual(['--json', 'rm', '--', ID]);
  expect(byTestId('remove-dialog')).toHaveLength(0);
  expect(count()).toBe('Archived0');
});
