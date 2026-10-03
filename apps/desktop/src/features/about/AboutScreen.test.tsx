// @vitest-environment happy-dom
import type { About } from '@mesa/core';
import { act } from 'react';
import { expect, test } from 'vitest';
import { click, envelope, fakeBridge, renderWithMesa } from '@/lib/testing';
import { AboutScreen } from './AboutScreen';

const ABOUT: About = {
  version: '0.1.0-beta.6',
  build: '512',
  license: 'MIT',
  links: {
    docs: 'https://github.com/guillezorrilla/mesa#readme',
    support: 'https://github.com/guillezorrilla/mesa/issues',
    releases: 'https://github.com/guillezorrilla/mesa/releases',
  },
  attributions: [
    {
      name: 'harbor-lights',
      version: '2.4.1',
      license: 'MIT',
      source: 'npm',
      text: 'MIT License, Harbor Lights',
    },
    {
      name: 'tauri',
      version: '2.11.6',
      license: 'Apache-2.0 OR MIT',
      source: 'crate',
      text: 'Apache License Version 2.0',
    },
  ],
};

async function render(about: About = ABOUT) {
  const { bridge, calls } = fakeBridge({
    about: () => envelope(about),
    'browser external': (args) => envelope({ url: args[4], opened: true }),
  });
  const byTestId = await renderWithMesa(<AboutScreen />, bridge);
  return { byTestId, calls };
}
const button = (label: string) =>
  [...document.querySelectorAll<HTMLButtonElement>('button')].find((b) =>
    b.textContent?.includes(label),
  );
const rows = (byTestId: (id: string) => HTMLElement[]) =>
  byTestId('attribution').map((row) => row.querySelector('button')?.textContent);

test('About shows the version and build, and opens each link in the browser', async () => {
  const { byTestId, calls } = await render();
  expect(calls).toContainEqual(['--json', 'about']);
  const screen = byTestId('about-screen')[0];
  expect(screen?.textContent).toContain('Version 0.1.0-beta.6 (build 512)');
  expect(screen?.textContent).toContain('MIT license');
  for (const [label, url] of [
    ['Documentation', ABOUT.links.docs],
    ['Support', ABOUT.links.support],
    ['Releases', ABOUT.links.releases],
  ] as const) {
    await click(button(label));
    expect(calls).toContainEqual(['--json', 'browser', 'external', '--', url]);
  }
});

test('the attributions are searchable, and a row expands to its license text', async () => {
  const { byTestId } = await render();
  expect(rows(byTestId)).toEqual(['harbor-lights2.4.1MIT', 'tauri2.11.6Apache-2.0 OR MIT']);
  const search = document.querySelector<HTMLInputElement>(
    'input[type="search"]',
  ) as HTMLInputElement;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(search, 'TAU');
    search.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(rows(byTestId)).toEqual(['tauri2.11.6Apache-2.0 OR MIT']);
  expect(byTestId('license-text')).toEqual([]);
  await click(button('tauri'));
  expect(byTestId('license-text')[0]?.textContent).toBe('Apache License Version 2.0');
  await click(button('tauri'));
  expect(byTestId('license-text')).toEqual([]);
});

test('a development build says why it lists no attributions', async () => {
  const note = 'A development build carries no attributions.';
  const { byTestId } = await render({ ...ABOUT, build: 'dev', attributions: [], note });
  expect(byTestId('about-screen')[0]?.textContent).toContain('(build dev)');
  expect(byTestId('about-screen')[0]?.textContent).toContain(note);
  expect(byTestId('attribution')).toEqual([]);
});
