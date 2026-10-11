// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, fill, press, renderWithMesa } from '@/lib/testing';
import { ManageViewsDialog } from './ManageViewsDialog';

const views = [{ name: 'JQL view', describe: 'JQL: project = LC (everyone, not done)' }];
const nameField = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Name of JQL view"]');
const focus = () => act(async () => nameField()?.focus());
const leave = () => act(async () => nameField()?.blur());

test('a view is renamed by editing its name; an empty name or Esc puts it back', async () => {
  let changed = 0;
  const renamed: [string, string][] = [];
  const { bridge, calls } = fakeBridge({
    'tickets views rename': () => envelope({ name: 'On call', describe: 'x' }),
  });
  const byTestId = await renderWithMesa(
    <ManageViewsDialog
      project="lantern-cove"
      views={views}
      onChanged={() => changed++}
      onRenamed={(from, to) => renamed.push([from, to])}
      onClose={() => {}}
    />,
    bridge,
  );
  // Opening edits nothing: no name is focused for one key to replace.
  expect(document.activeElement).not.toBe(nameField());

  await focus();
  await fill(nameField(), '  ');
  await leave();
  expect(nameField()?.value).toBe('JQL view');

  // Esc while editing puts the name back and keeps the dialog open.
  await focus();
  await fill(nameField(), 'Half typed');
  await press(nameField(), 'Escape');
  expect(nameField()?.value).toBe('JQL view');
  expect(byTestId('manage-views-dialog')).toHaveLength(1);
  await leave();

  await focus();
  await fill(nameField(), 'On call');
  await leave();
  expect(calls.map((args) => args.slice(1).join(' '))).toEqual([
    'tickets views rename -- JQL view On call',
  ]);
  expect(renamed).toEqual([['JQL view', 'On call']]);
  expect(changed).toBe(1);
});
