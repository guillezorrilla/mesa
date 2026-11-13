import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { servingPhone } from '../../testing/index.js';

test("the vault answers the phone: a project's memory, search, a note's links, the day, and a saved decision", async () => {
  const { mesa, calls, end } = await servingPhone();
  const vault = mesa.vault.list().vault;
  mkdirSync(join(vault, 'wiki/notes'), { recursive: true });
  writeFileSync(
    join(vault, 'projects/lantern-cove.md'),
    '# Lantern Cove\n\nCharts the tides; see [[tide-tables|the tables]].\n',
  );
  writeFileSync(
    join(vault, 'wiki/notes/tide-tables.md'),
    '---\nproject: lantern-cove\n---\n# Tide tables\n\nNeap tides read from [[lantern-cove]].\n',
  );

  expect((await calls.call({ method: 'projects' })).projects).toEqual([
    { name: 'lantern-cove', label: 'lantern-cove' },
  ]);
  const memory = await calls.call({ method: 'project', name: 'lantern-cove' });
  expect(memory.hub).toMatchObject({
    path: 'projects/lantern-cove.md',
    links: [{ text: '[[tide-tables|the tables]]', path: 'wiki/notes/tide-tables.md' }],
  });
  expect(memory.notes).toMatchObject([{ path: 'wiki/notes/tide-tables.md' }]);

  const found = await calls.call({ method: 'vaultSearch', text: 'neap' });
  expect(found.hits).toEqual([
    {
      path: 'wiki/notes/tide-tables.md',
      title: 'tide-tables',
      project: 'lantern-cove',
      line: 'Neap tides read from [[lantern-cove]].',
    },
  ]);
  const note = await calls.call({ method: 'vaultNote', path: found.hits[0]?.path ?? '' });
  expect(note).toMatchObject({
    title: 'tide-tables',
    body: '# Tide tables\n\nNeap tides read from [[lantern-cove]].',
    links: [{ text: '[[lantern-cove]]', path: 'projects/lantern-cove.md' }],
    clipped: false,
  });

  // Reading the day never builds its Daily note, nor syncs usage.
  const today = await calls.call({ method: 'today' });
  expect(today).toMatchObject({ date: '2026-09-24', daily: null, rewind: { ended: 0 } });
  expect(existsSync(join(vault, 'daily/2026-09-24.md'))).toBe(false);

  const saved = await calls.call({
    method: 'decide',
    project: 'lantern-cove',
    title: 'Metres for tides',
    decision: 'Tide heights are in metres',
    rationale: 'The tables print metres',
  });
  expect(saved).toMatchObject({
    path: 'wiki/decisions/2026-09-24-metres-for-tides.md',
    changed: true,
  });
  expect(saved.receipt).toMatch(/^receipts\//);
  expect(readFileSync(join(vault, saved.path), 'utf8')).toContain('The tables print metres');
  await mesa.daily.build();
  expect((await calls.call({ method: 'today' })).daily?.body).toContain('Metres for tides');
  await end();
});
