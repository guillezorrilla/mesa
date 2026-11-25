import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { lockDeps, profilePaths, scriptedRunner, tempDir } from '../testing/index.js';
import { changeLogFiles, fileSource, suggestedLogFiles, teeArgv } from './log-files.js';
import { parseLog } from './parse.js';

test('mesa logs run passes a command through and appends what it printed, with its exit status', () => {
  const dir = tempDir();
  const log = join(dir, 'tide-api.log');
  writeFileSync(log, 'INFO before\n');
  const [file = '', ...args] = teeArgv(log, [
    'sh',
    '-c',
    'printf "\\033[31mERROR boom\\033[0m\\n"; echo "INFO it\'s up"; exit 3',
  ]);
  const ran = spawnSync(file, args, { encoding: 'utf8' });
  expect(ran.status).toBe(3);
  expect(ran.stdout).toContain('ERROR boom');
  const lines = readFileSync(log, 'utf8').split('\n');
  expect(lines[0]).toBe('INFO before');
  const entries = parseLog(lines.map((line) => line.replace(/\x1b\[[0-9;]*m|\r/g, '')));
  expect(entries.filter((entry) => entry.level === 'error').map((entry) => entry.message)).toEqual([
    expect.stringContaining('ERROR boom'),
  ]);
  expect(entries.some((entry) => entry.message.includes("INFO it's up"))).toBe(true);
});

test("suggestions are the checkout's gitignored *.log files, outside node_modules and not kept yet", async () => {
  const { run, calls } = scriptedRunner({
    git: 'log/development.log\nstorage/logs/laravel.log\n',
  });
  expect(
    await suggestedLogFiles(run, '/src/harbour', ['/src/harbour/storage/logs/laravel.log']),
  ).toEqual(['/src/harbour/log/development.log']);
  expect(calls[0]?.args).toEqual([
    '-C',
    '/src/harbour',
    'ls-files',
    '--others',
    '--ignored',
    '--exclude-standard',
    '--',
    '*.log',
    ':(exclude,glob)**/node_modules/**',
  ]);
  expect(await suggestedLogFiles(scriptedRunner({}, { failing: ['git'] }).run, '/x', [])).toEqual(
    [],
  );
});

test('kept log files live in the registry entry, added once and removable; a missing one is refused', () => {
  const home = tempDir();
  const registry = profilePaths(home, 'default').registry;
  mkdirSync(join(home, '.mesa', 'default'), { recursive: true });
  writeFileSync(registry, 'projects:\n  - name: lantern-cove\n    path: /src/lantern-cove\n');
  const log = join(home, 'development.log');
  writeFileSync(log, '');
  expect(changeLogFiles(lockDeps(), registry, 'lantern-cove', log, true)).toEqual([log]);
  expect(changeLogFiles(lockDeps(), registry, 'lantern-cove', log, true)).toEqual([log]);
  expect(readFileSync(registry, 'utf8')).toContain(log);
  expect(changeLogFiles(lockDeps(), registry, 'lantern-cove', log, false)).toEqual([]);
  expect(readFileSync(registry, 'utf8')).not.toContain('logFiles');
  expect(() =>
    changeLogFiles(lockDeps(), registry, 'lantern-cove', join(home, 'gone.log'), true),
  ).toThrow(/no file/);
  expect(() => changeLogFiles(lockDeps(), registry, 'lantern-cove', 'relative.log', true)).toThrow(
    /absolute/,
  );
  expect(fileSource(join(home, 'gone.log'), new Date())).toMatchObject({
    lastLine: null,
    detail: `${join(home, 'gone.log')} (not there)`,
  });
});
