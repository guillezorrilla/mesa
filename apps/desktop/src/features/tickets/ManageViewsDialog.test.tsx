// @vitest-environment happy-dom
import { act } from 'react';
import { expect, test } from 'vitest';
import { envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { ManageViewsDialog } from './ManageViewsDialog';

const views = [{ name: 'JQL view', describe: 'JQL: project = LC (everyone, not done)' }];
const nameField = () =>
  document.querySelector<HTMLInputElement>('input[aria-label="Name of JQL view"]');
/** Types `text` into the name and leaves the field, as a person renaming does. */
const rename = (text: string) =>
  act(async () => {
    const field = nameField();
    if (!field) return;
    field.focus();
    field.value = text;
    field.blur();
  });

test('a view is renamed by editing its name, and an empty name or Esc puts it back', async () => {
  let changed = 0;
  const renamed: [string, string][] = [];
  const { bridge, calls } = fakeBridge({
    'tickets views rename': () => envelope({ name: 'On call', describe: 'x' }),
  });
  await renderWithMesa(
    <ManageViewsDialog
      project="lantern-cove"
      views={views}
      onChanged={() => changed++}
      onRenamed={(from, to) => renamed.push([from, to])}
      onClose={() => {}}
    />,
    bridge,
  );
  await rename('  ');
  expect(nameField()?.value).toBe('JQL view');
  // Esc while editing puts the name back and keeps the dialog open.
  await act(async () => {
    const field = nameField();
    field?.focus();
    if (field) field.value = 'Half typed';
    field?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(nameField()?.value).toBe('JQL view');
  await rename('On call');
  expect(calls.map((args) => args.slice(1).join(' '))).toContain(
    'tickets views rename -- JQL view On call',
  );
  expect(changed).toBe(1);
  expect(renamed).toEqual([['JQL view', 'On call']]);
});
