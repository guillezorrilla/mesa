import { readFileSync, writeFileSync } from 'node:fs';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { assistedSession, projectProfile, scriptedRunner, testDeps } from '../testing/index.js';
import { uninstallMesaMount } from './antigravity/mesa-mount.js';
import { claudeSettings } from './claude/paths.js';
import { DECISIONS_MOUNT } from './mesa-mount.js';

// Whether Mesa's hooks need an update (#678): only hooks Mesa installed once, that an install
// would now change.

test('hooks never installed need no update; hooks an older mesa wrote do, until install', async () => {
  const { home, mesa } = projectProfile(scriptedRunner().run);
  expect((await mesa.hooks.status()).needsUpdate).toBe(false);
  createMesa('default', testDeps(home, { self: ['/old/node', '/gone/mesa.js'] })).hooks.install();
  expect(await mesa.hooks.status()).toMatchObject({ stale: true, needsUpdate: true });
  mesa.hooks.install();
  expect(await mesa.hooks.status()).toMatchObject({ stale: false, needsUpdate: false });
});

test('an event Mesa hooks now, missing from hooks it wrote, makes them stale', async () => {
  const { home, mesa } = projectProfile(scriptedRunner().run);
  mesa.hooks.install();
  const path = claudeSettings(home, {});
  const settings = JSON.parse(readFileSync(path, 'utf8'));
  delete settings.hooks.UserPromptSubmit;
  writeFileSync(path, JSON.stringify(settings));
  expect(await mesa.hooks.status()).toMatchObject({
    installed: false,
    stale: true,
    needsUpdate: true,
  });
});

test("a Decision model without Antigravity's mesa-decisions entry needs an update, once installed", async () => {
  const { home, mesa } = await assistedSession();
  expect((await mesa.hooks.status()).needsUpdate).toBe(false);
  mesa.hooks.install();
  expect((await mesa.hooks.status()).needsUpdate).toBe(false);
  uninstallMesaMount(home, testDeps(home).self, DECISIONS_MOUNT);
  expect(await mesa.hooks.status()).toMatchObject({
    antigravityDecisions: { wanted: true, installed: false },
    needsUpdate: true,
  });
});
