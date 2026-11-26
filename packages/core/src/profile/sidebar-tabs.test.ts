import { expect, test } from 'vitest';
import { lockDeps, tempDir, thrown } from '../testing/index.js';
import { loadConfig, setConfigValue } from './config.js';
import { profilePaths } from './paths.js';
import { initProfile } from './profile.js';
import { denserTabStyle, sidebarTabs, withTabOrder, withTabShown } from './sidebar-tabs.js';

const config = (tabs?: { id: string; shown: boolean }[], cloudTab = true) => ({
  sidebar: { tabs },
  logs: { cloudTab },
});
const shape = (c: ReturnType<typeof config>) =>
  sidebarTabs(c).map((tab) => `${tab.id}:${tab.shown ? 'on' : 'off'}${tab.fixed ? ':fixed' : ''}`);

test('unset, the tabs are in the default order and all shown, Sessions and Projects fixed', () => {
  expect(shape(config())).toEqual([
    'sessions:on:fixed',
    'projects:on:fixed',
    'reviews:on',
    'logs:on',
  ]);
  expect(sidebarTabs(config())[2]).toMatchObject({ label: 'Reviews' });
});

test('the stored order wins; unknown, repeated and fixed ids drop, and a missing tab follows in default order', () => {
  expect(
    shape(
      config([
        { id: 'logs', shown: false },
        { id: 'timeline', shown: true },
        { id: 'sessions', shown: false },
        { id: 'logs', shown: true },
      ]),
    ),
  ).toEqual(['sessions:on:fixed', 'projects:on:fixed', 'logs:off', 'reviews:on']);
});

test('logs.cloudTab is read as the Logs tab only until sidebar.tabs names it', () => {
  expect(shape(config(undefined, false)).at(-1)).toBe('logs:off');
  expect(shape(config([{ id: 'logs', shown: true }], false))).toContain('logs:on');
});

test('withTabShown and withTabOrder write the optional tabs only, and refuse a fixed or unknown id', () => {
  const tabs = sidebarTabs(config(undefined, false));
  expect(withTabShown(tabs, 'reviews', false)).toEqual([
    { id: 'reviews', shown: false },
    { id: 'logs', shown: false },
  ]);
  expect(withTabOrder(tabs, ['logs', 'reviews'])).toEqual([
    { id: 'logs', shown: false },
    { id: 'reviews', shown: true },
  ]);
  expect(thrown(() => withTabShown(tabs, 'sessions', false))).toMatchObject({ code: 'usage' });
  expect(thrown(() => withTabShown(tabs, 'timeline', true))).toMatchObject({ code: 'usage' });
});

test('each style falls back to the next denser one, icons to none', () => {
  expect(denserTabStyle('labels')).toBe('compact');
  expect(denserTabStyle('compact')).toBe('icons');
  expect(denserTabStyle('icons')).toBeUndefined();
});

test('the profile config takes sidebar.tabs and sidebar.tabStyle, compact by default, and refuses another style', () => {
  const paths = profilePaths(tempDir(), 'default');
  initProfile(paths, { vault: '/tmp/v' });
  expect(loadConfig(paths.config).sidebar).toEqual({ tabStyle: 'compact' });
  setConfigValue(paths.config, 'sidebar.tabStyle', 'icons', lockDeps());
  setConfigValue(paths.config, 'sidebar.tabs', '[{id: reviews, shown: false}]', lockDeps());
  expect(loadConfig(paths.config).sidebar).toEqual({
    tabStyle: 'icons',
    tabs: [{ id: 'reviews', shown: false }],
  });
  expect(
    thrown(() => setConfigValue(paths.config, 'sidebar.tabStyle', 'tiny', lockDeps())),
  ).toMatchObject({ code: 'invalid_config' });
  // The retired field still sets, so a script that sets it keeps working.
  expect(setConfigValue(paths.config, 'logs.cloudTab', 'false', lockDeps()).value).toBe(false);
});
