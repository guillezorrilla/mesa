// @vitest-environment happy-dom
import { expect, test } from 'vitest';
import {
  click,
  envelope,
  fakeBridge,
  fakePlatform,
  fill,
  profileRow,
  renderWithMesa,
} from '@/lib/testing';
import { ProfilesSettingsPanel } from './ProfilesSettingsPanel';

async function render() {
  let profiles = [
    profileRow('default', { current: true, app: true }),
    profileRow('work', { vault: '/h/work-vault' }),
  ];
  const fake = fakeBridge({
    'profile list': () => envelope(profiles),
    'profile remove': (args) => {
      profiles = profiles.filter((p) => p.name !== args.at(-1));
      return envelope({ profile: args.at(-1), vault: '/h/work-vault', vaultDeleted: false });
    },
    'profile rename': (args) => envelope({ from: args.at(-2), to: args.at(-1) }),
    'profile use': (args) => envelope({ profile: args.at(-1) }),
    'profile open': (args) => envelope({ profile: args.at(-1), dir: '/h/.mesa/work' }),
  });
  const platform = fakePlatform();
  await renderWithMesa(<ProfilesSettingsPanel />, fake.bridge, platform);
  return { calls: fake.calls, platform };
}
const byLabel = (label: string) =>
  document.querySelector<HTMLElement>(`[aria-label="${label}"]`) ?? undefined;
const typeInto = async (label: string, value: string) => {
  const input = byLabel(label) as HTMLInputElement;
  input.id ||= `field-${label.replace(/\W/g, '')}`;
  await fill(input.id, value);
};

test('remove says what happens, needs the name typed, and keeps the vault', async () => {
  const { calls } = await render();
  expect((byLabel('Remove default') as HTMLButtonElement).disabled).toBe(true);
  await click(byLabel('Remove work'));
  const form = document.querySelector('[data-testid="remove-profile"]');
  expect(form?.textContent).toContain(
    "Stops its sessions' server, forgets its projects and keys; your vault at /h/work-vault is kept.",
  );
  const submit = form?.querySelector<HTMLButtonElement>('button[type="submit"]');
  expect(submit?.disabled).toBe(true);
  await typeInto('Type work to confirm', 'wor');
  expect(submit?.disabled).toBe(true);
  await typeInto('Type work to confirm', 'work');
  await click(submit ?? undefined);
  expect(calls).toContainEqual(['--json', 'profile', 'remove', '--yes', '--', 'work']);
  expect(document.body.textContent).not.toContain('/h/work-vault');
});

test('rename takes a slug, and renaming the current profile switches to the new name', async () => {
  const { calls, platform } = await render();
  await click(byLabel('Rename work'));
  await typeInto('New name for work', 'Client');
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Rename to client'),
  );
  expect(calls).toContainEqual(['--json', 'profile', 'rename', '--', 'work', 'client']);
  expect(platform.switched).toEqual([]);

  await click(byLabel('Rename default'));
  await typeInto('New name for default', 'home');
  await click(
    [...document.querySelectorAll('button')].find((b) => b.textContent === 'Rename to home'),
  );
  expect(platform.switched).toEqual(['home']);
});

test('open folder shows the profile in Finder', async () => {
  const { calls } = await render();
  await click(byLabel("Open work's folder"));
  expect(calls).toContainEqual(['--json', 'profile', 'open', '--', 'work']);
});
