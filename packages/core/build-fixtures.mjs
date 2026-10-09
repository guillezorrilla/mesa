import assert from 'node:assert/strict';
import { cpSync, existsSync, rmSync } from 'node:fs';

// tsc emits code only. The published testing seam also reads these invented provider fixtures,
// the invented attributions file and the invented relevance vault.
for (const dir of ['agents/claude', 'agents/codex', 'about', 'decisions']) {
  cpSync(
    new URL(`src/${dir}/fixtures`, import.meta.url),
    new URL(`dist/${dir}/fixtures`, import.meta.url),
    { recursive: true },
  );
}

// Exercise the package export, without Vitest's source alias hiding missing build assets.
const { claudeResult, codexResult, codexWorld, fakeRelease } = await import('@mesa/core/testing');
assert.ok(JSON.parse(fakeRelease().attributions()).length > 0);
for (const name of ['success', 'not-logged-in']) assert.ok(JSON.parse(claudeResult(name)));
for (const name of ['success', 'skill-stdin']) {
  for (const line of codexResult(name).trim().split('\n')) assert.ok(JSON.parse(line));
}
const world = codexWorld();
try {
  assert.ok(
    existsSync(
      world.rollout({
        id: '00000000-0000-4000-8000-000000000001',
        cwd: world.home,
        startedAt: '2026-09-24T12:00:00.000Z',
      }),
    ),
  );
} finally {
  rmSync(world.home, { recursive: true, force: true });
}
