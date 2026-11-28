import { createInterface } from 'node:readline';
import { PassThrough } from 'node:stream';
import { tempDir } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import { runCli } from './cli.js';
import { serveCommands } from './serve.js';
import { cliDeps } from './testing.js';

async function* linesOf(lines: string[]) {
  yield* lines;
}

const replies = (written: string[]) => written.map((line) => JSON.parse(line));

test('mesa serve answers each request line with its call, and refuses what it cannot run under its id', async () => {
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
      '{"id":4,"args":["--json","serve"]}',
      '{"id":5,"args":["--json","host","a1b2c3d4"]}',
      '{"id":6,"args":["--json","vault","mcp","--tools"]}',
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
  const refusal = (r: { stdout: string }) => JSON.parse(r.stdout).error;
  const nulls = replies(written).filter((r) => r.id === null);
  expect(nulls.map((r) => [r.code, refusal(r)])).toEqual([
    [2, { code: 'usage', message: 'mesa serve: not a request line' }],
  ]);
  // Malformed, but numbered: answered under its id, so its caller is not left waiting.
  expect([byId.get(3).code, refusal(byId.get(3)).message]).toEqual([
    2,
    'mesa serve: not a request line',
  ]);
  // Its stdout would be its own protocol's, not a reply: refused before it runs (no host started).
  expect(refusal(byId.get(4)).message).toBe('mesa serve: serve serves; run it as its own process');
  expect(refusal(byId.get(5)).message).toBe('mesa serve: host serves; run it as its own process');
  // The same command printing, not serving, runs (the app's Session details).
  expect(JSON.parse(byId.get(6).stdout).ok).toBe(true);
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

test('a call written the moment mesa serve starts is answered, while its socket is still being set up', async () => {
  const out = await runCli(['serve'], cliDeps(tempDir()));
  // As the entrypoint gives them: a line reader over stdin, reading from the start.
  const stdin = new PassThrough();
  const written: string[] = [];
  const served = out.serve?.({
    lines: createInterface({ input: stdin, crlfDelay: Number.POSITIVE_INFINITY }),
    write: (text) => written.push(text),
    log: () => {},
  });
  // The app writes at once, before the Command socket is set up.
  stdin.write('{"id":1,"args":["--json","--version"]}\n');
  for (let i = 0; i < 100 && written.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
  expect(written.map((line) => JSON.parse(line).id)).toEqual([1]);
  stdin.end();
  await served;
});

test('once the code on disk is not the code loaded, mesa serve hands each request back unrun', async () => {
  let rebuilt = false;
  const ran: string[][] = [];
  const written: string[] = [];
  async function* lines() {
    yield '{"id":1,"args":["--json","logs","projects"]}';
    rebuilt = true;
    yield '{"id":2,"args":["--json","logs","envs"]}';
  }
  await serveCommands(
    { lines: lines(), write: (text) => written.push(text), log: () => {} },
    async (argv) => {
      ran.push(argv);
      return { code: 0, stdout: '{"ok":true}\n', stderr: '' };
    },
    () => rebuilt,
  );
  expect(ran).toEqual([['--json', 'logs', 'projects']]);
  expect(replies(written).sort((a, b) => a.id - b.id)).toEqual([
    { id: 1, code: 0, stdout: '{"ok":true}\n', stderr: '' },
    { id: 2, here: true, code: 0, stdout: '', stderr: '' },
  ]);
});
