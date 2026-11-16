// @vitest-environment happy-dom
import type { TreeRow } from '@mesa/core';
import { expect, test } from 'vitest';
import { SegmentedControl } from '@/components/SegmentedControl';
import { click, envelope, fakeBridge, managedRow, renderWithMesa } from '@/lib/testing';
import { useSessionAct } from '../useSessionAct';
import { SwitchViewDialog } from './SwitchViewDialog';
import { useSessionView } from './useSessionView';

const VIEWS = [
  ['terminal', 'Terminal'],
  ['chat', 'Chat (beta)'],
] as const;

/** The view control and its mid-turn dialog, as SessionsScreen wires them. */
function ViewControl({ row }: { row: TreeRow }) {
  const { acting, act } = useSessionAct(async () => undefined);
  const view = useSessionView(row, 'terminal', act);
  return (
    <>
      <SegmentedControl
        label="Session view"
        options={VIEWS}
        value={view.view}
        disabled={view.switching}
        onChange={view.choose}
      />
      {view.asking && (
        <SwitchViewDialog
          to={view.asking}
          disabled={acting}
          onConfirm={view.confirm}
          onCancel={view.cancel}
        />
      )}
    </>
  );
}

const idle = managedRow('dddddddd', {
  lastState: { state: 'idle', confidence: 0.95, at: '2026-09-25T12:00:00.000Z', source: 'hook' },
});
const chat = () =>
  [...document.querySelectorAll<HTMLButtonElement>('button[role="radio"]')].find(
    (b) => b.textContent === 'Chat (beta)',
  );
const switched = () => envelope({ ...idle, view: 'structured', switched: true, receipt: null });

test('choosing Chat on an idle Claude Code session switches it to Structured view', async () => {
  const { bridge, calls } = fakeBridge({ 'sessions view': switched });
  await renderWithMesa(<ViewControl row={idle} />, bridge);
  await click(chat());
  expect(calls).toContainEqual(['--json', 'sessions', 'view', '--', 'dddddddd', 'structured']);
});

test('mid-turn it asks first; Interrupt and switch switches with --interrupt', async () => {
  const { bridge, calls } = fakeBridge({ 'sessions view': switched });
  const byTestId = await renderWithMesa(<ViewControl row={managedRow('eeeeeeee')} />, bridge);
  await click(chat());
  const dialog = byTestId('switch-view-dialog')[0];
  expect(dialog?.textContent).toContain(
    'The agent is working. Wait for it to finish, or interrupt and switch.',
  );
  expect(calls.some((c) => c[1] === 'sessions' && c[2] === 'view')).toBe(false);
  await click(byTestId('switch-view-interrupt')[0]);
  expect(calls).toContainEqual([
    '--json',
    'sessions',
    'view',
    '--interrupt',
    '--',
    'eeeeeeee',
    'structured',
  ]);
});
