import { describe, expect, it } from 'vitest';
import { envSpawner } from './spawn.js';

const run = (file: string, args: string[], input?: string) =>
  new Promise<{ out: string; exit: unknown }>((resolve) => {
    const child = envSpawner({ PATH: process.env.PATH })(file, args, {});
    let out = '';
    child.onStdout((chunk) => {
      out += chunk;
    });
    child.onExit((exit) => resolve({ out, exit }));
    if (input !== undefined) child.write(input);
  });

describe('envSpawner', () => {
  it('writes to stdin, reads stdout, and reports the exit code', async () => {
    const { out, exit } = await run('head', ['-n1'], 'hello\n');
    expect(out).toBe('hello\n');
    expect(exit).toEqual({ code: 0 });
  });

  it('reports a missing binary as an exit, once', async () => {
    const { exit } = await run('mesa-no-such-binary', []);
    expect(exit).toMatchObject({ code: undefined });
    expect((exit as { detail: string }).detail).toContain('ENOENT');
  });
});
