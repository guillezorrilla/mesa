// @vitest-environment happy-dom
import { sessionUri } from '@mesa/core/browser';
import { act, useState } from 'react';
import { expect, test } from 'vitest';
import { App } from './App';
import type { Bridge } from './lib/client';
import { MesaRoot } from './lib/MesaRoot';
import {
  deferred,
  envelope,
  failure,
  fakeBridge,
  fakePlatform,
  renderWithMesa,
  toastTexts,
} from './lib/testing';

const lookups = (calls: string[][]) => calls.filter((args) => args[1] === 'show');
const guidance = () => document.querySelector('[data-testid="mesa-link-guidance"]')?.textContent;
const selected = () => document.querySelector('[data-testid="selected-session"]')?.textContent;

test('a startup encoded session link waits for active profile information then uses the existing CLI show seam', async () => {
  const profile = deferred();
  const name = "coast!'()* /? #🐚";
  const { bridge, calls } = fakeBridge({
    profile: () => profile.promise,
    show: () => envelope({ id: 'aaaaaaaa' }),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      deepLinks: {
        current: async () => [sessionUri('aaaaaaaa', name)],
        onOpen: async () => () => {},
      },
    }),
  );
  expect(lookups(calls)).toEqual([]);
  expect(byTestId('projects-screen')).toHaveLength(0);
  await act(async () => profile.resolve(envelope({ profile: name, dir: '/h/invented-profile' })));
  expect(lookups(calls)).toEqual([['--json', 'show', '--', 'aaaaaaaa']]);
  expect(selected()).toContain('aaaaaaaa');
  expect(guidance()).toBeUndefined();
  expect(toastTexts(byTestId)).toEqual([]);
});

test('a qualified mismatch never looks up the active same-id record or enters cloning', async () => {
  const { bridge, calls } = fakeBridge({
    profile: () => envelope({ profile: 'second', dir: '/h/second' }),
    show: () => envelope({ id: 'aaaaaaaa' }),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      deepLinks: {
        current: async () => [sessionUri('aaaaaaaa', 'first')],
        onOpen: async () => () => {},
      },
    }),
  );
  expect(guidance()).toContain('profile first');
  expect(lookups(calls)).toEqual([]);
  expect(calls.some((args) => args.includes('--profile'))).toBe(false);
  expect(selected()).toBeUndefined();
  expect(byTestId('projects-screen')).toHaveLength(0);
  expect(toastTexts(byTestId)).toEqual([]);
});

test('live bare links use only the active profile, unknown and malformed links stay quiet, and cloning still waits for confirmation', async () => {
  let opened: (urls: string[]) => void = () => {};
  const { bridge, calls } = fakeBridge({
    show: (args) =>
      args.at(-1) === 'aaaaaaaa' ? envelope({ id: 'aaaaaaaa' }) : failure('no record'),
  });
  const byTestId = await renderWithMesa(
    <App />,
    bridge,
    fakePlatform({
      deepLinks: {
        current: async () => null,
        onOpen: async (handler) => {
          opened = handler;
          return () => {};
        },
      },
    }),
  );
  await act(async () => opened(['mesa://session/%61aaaaaaa']));
  expect(selected()).toContain('aaaaaaaa');
  expect(lookups(calls)).toEqual([['--json', 'show', '--', 'aaaaaaaa']]);
  await act(async () => opened(['mesa://session/bbbbbbbb']));
  expect(guidance()).toContain('bbbbbbbb is unavailable');
  expect(selected()).toContain('aaaaaaaa');
  const count = lookups(calls).length;
  for (const link of [
    'mesa://session/%zz',
    'mesa://session/aaaaaaaa?profile=',
    'mesa://session/aaaaaaaa?profile=%ff',
    'mesa://session/aaaaaaaa?profile=a&profile=b',
    'mesa://session/../aaaaaaaa',
    'mesa://unknown/aaaaaaaa',
  ]) {
    await act(async () => opened([link]));
    expect(guidance()).toContain('Invalid Mesa link');
    expect(lookups(calls)).toHaveLength(count);
    expect(byTestId('projects-screen')).toHaveLength(0);
  }
  expect(toastTexts(byTestId)).toEqual([]);
  const clone = 'mesa://clone?url=https%3A%2F%2Fexample.com%2Fteam%2Flantern-cove.git';
  await act(async () => opened([clone]));
  expect(byTestId('projects-screen')).toHaveLength(1);
  expect((byTestId('repository-url')[0] as HTMLInputElement).value).toBe(clone);
  expect(calls.some((args) => args[1] === 'projects' && args[2] === 'clone')).toBe(false);
  expect(guidance()).toBeUndefined();
});

test.each([true, false])(
  'profile replacement clears selection and ignores a prior profile pending %s lookup',
  async (success) => {
    let opened: (urls: string[]) => void = () => {};
    const pending = deferred();
    let firstShows = 0;
    const first = fakeBridge({
      show: () => (++firstShows === 1 ? envelope({ id: 'aaaaaaaa' }) : pending.promise),
    });
    const second = fakeBridge({
      profile: () => envelope({ profile: 'second', dir: '/h/second' }),
      show: () => envelope({ id: 'bbbbbbbb' }),
    });
    const platform = fakePlatform({
      deepLinks: {
        current: async () => null,
        onOpen: async (handler) => {
          opened = handler;
          return () => {};
        },
      },
    });
    let use: (bridge: Bridge) => void = () => {};
    function Profiles() {
      const [bridge, setBridge] = useState<Bridge>(() => first.bridge);
      use = (next) => setBridge(() => next);
      return (
        <MesaRoot bridge={bridge} platform={platform}>
          <App />
        </MesaRoot>
      );
    }
    const byTestId = await renderWithMesa(<Profiles />, first.bridge);
    await act(async () => opened([sessionUri('aaaaaaaa', 'default')]));
    expect(selected()).toContain('aaaaaaaa');
    await act(async () => opened([sessionUri('bbbbbbbb', 'default')]));
    await act(async () => use(second.bridge));
    expect(selected()).toBeUndefined();
    await act(async () =>
      pending.resolve(success ? envelope({ id: 'bbbbbbbb' }) : failure('old profile failed')),
    );
    expect(selected()).toBeUndefined();
    expect(guidance()).toBeUndefined();
    expect(lookups(second.calls)).toEqual([]);
    await act(async () => opened([sessionUri('bbbbbbbb', 'default')]));
    expect(lookups(second.calls)).toEqual([]);
    expect(guidance()).toContain('profile default');
    await act(async () => opened([sessionUri('bbbbbbbb', 'second')]));
    expect(selected()).toContain('bbbbbbbb');
    expect(toastTexts(byTestId)).toEqual([]);
  },
);
