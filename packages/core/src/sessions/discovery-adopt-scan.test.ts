import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import {
  countReads,
  datedTranscript,
  fakeTmux,
  projectProfile,
  scriptedRunner,
  sequentialIds,
} from '../testing/index.js';

// What an adoption takes from its one discovery scan. The fixed clock is 2026-09-24T12:00:00.000Z.

/** A profile over a fake tmux with no running sessions, and unregistered repositories `names`. */
function setUp(...names: string[]) {
  const { run } = scriptedRunner({
    tmux: fakeTmux().answer,
    claude: (args) => (args.includes('agents') ? '[]' : '2.1.283 (Claude Code)'),
  });
  const made = projectProfile(run, { newId: sequentialIds() });
  const folders = names.map((name) => {
    const folder = join(made.home, 'src', name);
    mkdirSync(join(folder, '.git'), { recursive: true });
    return folder;
  });
  return { ...made, folders };
}

test('a scan adopts every conversation of its folders, past the newest 300 discovery lists', async () => {
  const { home, mesa, folders } = setUp('tide-pool', 'harbor', 'reef');
  for (const [i, folder] of folders.entries()) {
    for (let j = 0; j < 120; j++) {
      const id = `5b1e2f40-9c3d-4e7a-8f10-${String(i * 1000 + j).padStart(12, '0')}`;
      const at = new Date(Date.parse('2026-09-23T00:00:00.000Z') - (j * 3 + i) * 60_000);
      datedTranscript(home, id, folder, at.toISOString());
    }
  }
  const {
    result: { items },
  } = await mesa.sessions.adoptDiscoveredEach({ paths: folders, days: 30 });
  expect(items.map((i) => [i.project, i.adopted.length, i.failed.length])).toEqual([
    ['tide-pool', 120, 0],
    ['harbor', 120, 0],
    ['reef', 120, 0],
  ]);
});

test('a conversation with no name is read for one once, not again by its adoption', async () => {
  const { home, mesa, folders } = setUp('tide-pool');
  const [tide = ''] = folders;
  const file = datedTranscript(
    home,
    '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e70',
    tide,
    '2026-09-23T10:00:00.000Z',
  );
  const reads = countReads();
  try {
    const { result } = await mesa.sessions.adoptDiscovered({ path: tide, days: 30 });
    expect(result.adopted).toEqual([
      {
        id: expect.any(String),
        agentSessionId: '5b1e2f40-9c3d-4e7a-8f10-2a3b4c5d6e70',
        agent: 'claude',
      },
    ]);
  } finally {
    reads.restore();
  }
  // Its head for its folder, its tail for a name.
  expect(reads.opened.filter((f) => f === file)).toHaveLength(2);
});
