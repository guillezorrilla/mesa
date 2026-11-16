import { tempDir } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import { runCli } from './cli.js';
import { serveCommands } from './serve.js';
import { cliDeps } from './testing.js';

async function* linesOf(lines: string[]) {
  yield* lines;
}

const replies = (written: string[]) => written.map((line) => JSON.parse(line));

test('mesa serve answers each request line with its call, and a line that is no request with id null', async () => {
  const out = await runCli(['serve'], cliDeps(tempDir()));
  expect(out.stdout).toBe('');
  const written: string[] = [];
  await out.serve?.({
    lines: linesOf([
      '{"id":1,"args":["--json","--version"]}',
      '',
      '{"id":2,"args":["--json","nope"]}',
      'not json',
      '{"id":3,"args":[1]}',
    ]),
    write: (text) => written.push(text),
    log: () => {},
  });
  expect(written.every((line) => line.endsWith('\n'))).toBe(true);
  const byId = new Map(replies(written).map((r) => [r.id, r]));
  expect(byId.get(1)).toMatchObject({ code: 0, stderr: '' });
  expect(JSON.parse(byId.get(1).stdout)).toMatchObject({ ok: true });
  expect(byId.get(2).code).toBe(2);
  expect(JSON.parse(byId.get(2).stdout).error.code).toBe('usage');
  expect(replies(written).filter((r) => r.id === null)).toEqual([
    { id: null, code: 2, stdout: '', stderr: 'mesa serve: not a request line\n' },
    { id: null, code: 2, stdout: '', stderr: 'mesa serve: not a request line\n' },
  ]);
});

test('calls overlap: a quick one answers before a slow one sent first, each with its own stdin', async () => {
  const written: string[] = [];
  let release = () => {};
  const slow = new Promise<void>((resolve) => {
    release = resolve;
  });
  const served = serveCommands(
    {
      lines: linesOf([
        '{"id":1,"args":["slow"],"stdin":"first"}',
        '{"id":2,"args":["quick"],"stdin":"second"}',
        '{"id":3,"args":["boom"]}',
      ]),
      write: (text) => {
        written.push(text);
        if (written.length === 2) release();
      },
      log: () => {},
    },
    async ([name], stdin) => {
      if (name === 'slow') await slow;
      if (name === 'boom') throw new Error('it broke');
      return { code: 0, stdout: `${name}:${stdin}`, stderr: '' };
    },
  );
  await served;
  expect(replies(written)).toEqual([
    { id: 2, code: 0, stdout: 'quick:second', stderr: '' },
    { id: 3, code: 1, stdout: '', stderr: 'it broke\n' },
    { id: 1, code: 0, stdout: 'slow:first', stderr: '' },
  ]);
});
