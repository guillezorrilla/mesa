import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { tempDir } from '../../testing/index.js';
import { mesaOnPath } from './mesa-shim.js';

test('a window finds the Mesa that started it first on its PATH, whatever its words', () => {
  const dir = join(tempDir(), 'bin');
  // A build run as several words, one with a quote in it, the way a dev build runs as node <cli>.
  const path = mesaOnPath(dir, ['/bin/echo', "tide's"], '/usr/bin:/bin');
  expect(path).toBe(`${dir}:/usr/bin:/bin`);
  const said = execFileSync('/bin/sh', ['-c', 'mesa prs draft 36'], { env: { PATH: path } });
  expect(said.toString()).toBe("tide's prs draft 36\n");
  // Another build takes it over.
  mesaOnPath(dir, ['/bin/echo', 'reef'], undefined);
  expect(execFileSync(join(dir, 'mesa'), ['x']).toString()).toBe('reef x\n');
});
