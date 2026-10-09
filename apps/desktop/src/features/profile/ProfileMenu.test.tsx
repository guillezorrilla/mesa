// @vitest-environment happy-dom
import { createRef } from 'react';
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
import { ProfileMenu } from './ProfileMenu';

const PROFILES = [
  profileRow('default', { current: true, app: true }),
  profileRow('work', { projects: 2 }),
];

async function render(folder: string | null = null) {
  const fake = fakeBridge({
    'profile list': () => envelope(PROFILES),
    'profile use': (args) => envelope({ profile: args.at(-1) }),
    'profile create': (args) =>
      envelope({ profile: args.at(-1), dir: `/h/.mesa/${args.at(-1)}`, vault: '/h/v' }),
  });
  const platform = fakePlatform({ folder });
  const byTestId = await renderWithMesa(
    <ProfileMenu ref={createRef()} doctor={undefined} onSettings={() => {}} />,
    fake.bridge,
    platform,
  );
  return { byTestId, calls: fake.calls, platform };
}
const button = (text: string) =>
  [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

test('the switcher lists the profiles, marks the active one, and switches to another', async () => {
  const { byTestId, calls, platform } = await render();
  expect(byTestId('profile-button-name')[0]?.textContent).toBe('default');
  const choices = byTestId('profile-choice');
  expect(choices.map((c) => [c.textContent, c.getAttribute('aria-current')])).toEqual([
    ['default', 'true'],
    ['work', null],
  ]);
  expect(choices[0]?.querySelector('svg')?.classList.contains('invisible')).toBe(false);
  expect(choices[1]?.querySelector('svg')?.classList.contains('invisible')).toBe(true);
  await click(choices[1]);
  expect(calls).toContainEqual(['--json', 'profile', 'use', '--', 'work']);
  expect(platform.switched).toEqual(['work']);
});

test('New profile previews the slug, refuses a taken name, and creates then switches', async () => {
  const { byTestId, calls, platform } = await render('/h/notes');
  await click(byTestId('new-profile')[0]);
  const submit = byTestId('create-profile')[0] as HTMLButtonElement;
  expect(submit.disabled).toBe(true);
  await fill('profile-name', 'Work');
  expect(byTestId('profile-slug')[0]?.textContent).toBe('A profile named work already exists.');
  expect(submit.disabled).toBe(true);
  await fill('profile-name', 'Client Work!');
  expect(byTestId('profile-slug')[0]?.textContent).toBe('Saved as client-work');
  expect(document.body.textContent).toContain('/h/Documents/Mesa-client-work');
  expect(document.body.textContent).toContain('Copy settings from default');
  expect(submit.disabled).toBe(false);

  await click(document.getElementById('vault-existing') ?? undefined);
  expect(submit.disabled).toBe(true);
  await click(button('Choose folder'));
  expect(document.body.textContent).toContain('/h/notes');
  await click(document.getElementById('copy-settings') ?? undefined);
  await click(submit);
  expect(calls).toContainEqual([
    '--json',
    'profile',
    'create',
    '--vault=/h/notes',
    '--copy-settings',
    '--',
    'client-work',
  ]);
  expect(platform.switched).toEqual(['client-work']);
});

test('one profile shows no name on the button', async () => {
  const fake = fakeBridge();
  const byTestId = await renderWithMesa(
    <ProfileMenu ref={createRef()} doctor={undefined} onSettings={() => {}} />,
    fake.bridge,
  );
  expect(byTestId('profile-button-name')).toEqual([]);
  expect(byTestId('profile-choice').map((c) => c.textContent)).toEqual(['default']);
});
