// @vitest-environment happy-dom
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { click, deferred, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { CloneProjectDialog } from './CloneProjectDialog';

test('native checkout confirmation rejects invalid URLs and only clones after explicit submission', async () => {
  const { bridge, calls } = fakeBridge({
    'projects clone': () => envelope({ name: 'lantern', receipt: null }),
  });
  let cloned = '';
  const byTestId = await renderWithMesa(
    <CloneProjectDialog
      url="file:///tmp/repo"
      onCancel={() => {}}
      onCloned={async (name) => {
        cloned = name;
      }}
    />,
    bridge,
  );
  expect(byTestId('clone-project')[0]?.hasAttribute('disabled')).toBe(true);
  expect(calls).toHaveLength(0);
  const field = byTestId('repository-url')[0] as HTMLInputElement;
  const url = 'https://example.com/team/lantern.git';
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(field, url);
    field.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await click(byTestId('clone-project')[0]);
  expect(calls).toEqual([['--json', 'projects', 'clone', '--', url]]);
  expect(cloned).toBe('lantern');
});

test('pending checkout keeps its confirmation open until cloning finishes', async () => {
  const checkout = deferred();
  const { bridge, calls } = fakeBridge({ 'projects clone': () => checkout.promise });
  let cloned = '';
  function Confirmation() {
    const [open, setOpen] = useState(true);
    return open ? (
      <CloneProjectDialog
        url="https://example.com/team/lantern.git"
        onCancel={() => setOpen(false)}
        onCloned={async (name) => {
          cloned = name;
        }}
      />
    ) : null;
  }
  const byTestId = await renderWithMesa(<Confirmation />, bridge);
  await click(byTestId('clone-project')[0]);
  const dialog = byTestId('clone-project-dialog')[0]!;
  await click(
    [...dialog.querySelectorAll('button')].find((button) => button.textContent === 'Cancel'),
  );
  await act(async () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
  expect(byTestId('clone-project-dialog')).toHaveLength(1);
  expect(byTestId('repository-url')[0]?.hasAttribute('disabled')).toBe(true);
  expect(calls).toHaveLength(1);
  await act(async () => checkout.resolve(envelope({ name: 'lantern', receipt: null })));
  expect(cloned).toBe('lantern');
  expect(byTestId('clone-project-dialog')).toHaveLength(0);
});
