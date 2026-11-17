import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test } from 'vitest';
import { createMesa } from '../mesa.js';
import { projectProfile, scriptedRunner, testDeps } from '../testing/index.js';
import { antigravityMcpConfig } from './antigravity/paths.js';
import { claudeSettings } from './claude/paths.js';
import { codexHome, codexMesaRules } from './codex/paths.js';

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

test("Mesa's old Antigravity entries, or a missing Codex rules file, need an update once installed", async () => {
  const { home, mesa } = projectProfile(scriptedRunner().run);
  mesa.hooks.install();
  expect((await mesa.hooks.status()).needsUpdate).toBe(false);
  rmSync(codexMesaRules(codexHome(home, {})));
  expect(await mesa.hooks.status()).toMatchObject({ codex: { rules: false }, needsUpdate: true });
  mesa.hooks.install();
  expect(readFileSync(codexMesaRules(codexHome(home, {})), 'utf8')).toContain(
    'prefix_rule(pattern=["mesa","vault","search"], decision="allow")',
  );
  const mcp = antigravityMcpConfig(home);
  mkdirSync(dirname(mcp), { recursive: true });
  writeFileSync(
    mcp,
    JSON.stringify({ mcpServers: { 'mesa-vault': { command: 'mesa', args: ['vault', 'mcp'] } } }),
  );
  expect(await mesa.hooks.status()).toMatchObject({
    antigravityMounts: { left: true },
    needsUpdate: true,
  });
  mesa.hooks.install();
  expect((await mesa.hooks.status()).needsUpdate).toBe(false);
});
