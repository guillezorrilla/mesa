// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import { Button } from '@/components/ui/button';
import {
  click,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
  toastTexts,
} from '@/lib/testing';
import { AddVaultProvider } from './AddVaultDialog';
import { useOpenInObsidian } from './useOpenInObsidian';

const VAULT = '/h/Documents/Tidewater';

const unknown = (installed = true) => ({
  ok: false,
  error: {
    code: 'not_found',
    message: `Obsidian does not know the vault ${VAULT} yet`,
    details: { unknownVault: true, vault: VAULT, installed },
  },
});

function Opener() {
  const { openNote } = useOpenInObsidian();
  return (
    <Button data-testid="open" onClick={() => void openNote('daily/2026-10-13')}>
      Open in Obsidian
    </Button>
  );
}

/** An Open in Obsidian under the guide; `vault open` answers with `replies` in turn. */
async function setup(replies: unknown[], options: { guided?: boolean } = {}) {
  const { bridge, calls } = fakeBridge({
    'vault open': () => replies.shift() ?? envelope({ opened: true, method: 'uri', target: 'x' }),
    'obsidian manager': () => envelope({ opened: true, target: 'obsidian://choose-vault' }),
    'doctor install': () => envelope({ name: 'obsidian', installed: true }),
  });
  const platform = fakePlatform();
  const ui =
    options.guided === false ? <Opener /> : <AddVaultProvider>{<Opener />}</AddVaultProvider>;
  const byTestId = await renderWithMesa(ui, bridge, platform);
  await click(byTestId('open')[0]);
  const opens = () => calls.filter((args) => args[1] === 'vault' && args[2] === 'open');
  return { byTestId, calls, opens, pasteboard: platform.pasteboard };
}

test('an unknown vault opens the guide: copy the path, open the manager, then Done retries the note', async () => {
  const { byTestId, calls, opens, pasteboard } = await setup([unknown(), unknown()]);
  expect(byTestId('add-vault-path')[0]?.textContent).toBe(VAULT);
  expect(toastTexts(byTestId)).toEqual([]);

  await click(byTestId('add-vault-open-manager')[0]);
  expect(pasteboard).toEqual([VAULT]);
  expect(calls).toContainEqual(['--json', 'obsidian', 'manager']);

  // Not added yet: the guide stays and says so.
  await click(byTestId('add-vault-retry')[0]);
  expect(byTestId('add-vault-still-unknown')).toHaveLength(1);
  expect(byTestId('add-vault-dialog')).toHaveLength(1);

  // Added: Done opens the same note and the guide closes.
  await click(byTestId('add-vault-retry')[0]);
  expect(opens().map((args) => args.at(-1))).toEqual([
    'daily/2026-10-13',
    'daily/2026-10-13',
    'daily/2026-10-13',
  ]);
  expect(byTestId('add-vault-dialog')).toHaveLength(0);
});

test('without Obsidian the guide offers Install first, then the steps', async () => {
  const { byTestId, calls } = await setup([unknown(false)]);
  expect(byTestId('add-vault-open-manager')).toHaveLength(0);
  expect(byTestId('add-vault-retry')[0]?.hasAttribute('disabled')).toBe(true);
  await click(byTestId('install-button')[0]);
  expect(calls).toContainEqual(['--json', 'doctor', 'install', 'obsidian']);
  expect(byTestId('add-vault-open-manager')).toHaveLength(1);
});

test('other failures toast, and a screen on its own toasts an unknown vault too', async () => {
  const missing = await setup([failure('no note at daily/2026-10-13')]);
  expect(missing.byTestId('add-vault-dialog')).toHaveLength(0);
  expect(toastTexts(missing.byTestId)).toEqual(['no note at daily/2026-10-13']);

  const alone = await setup([unknown()], { guided: false });
  expect(alone.byTestId('add-vault-dialog')).toHaveLength(0);
  expect(toastTexts(alone.byTestId)).toEqual([`Obsidian does not know the vault ${VAULT} yet`]);
});
