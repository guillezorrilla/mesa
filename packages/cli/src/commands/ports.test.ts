import { plantOutputLog } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('ports lists the local URLs sessions printed, listening first; an unknown session is not_found', async () => {
  cli.withTmux();
  await cli.withProject();
  const open = async () => (await mesa('open', 'lantern-cove')).stdout.split('\n')[0] ?? '';
  const [vite, next, quiet] = [await open(), await open(), await open()];
  plantOutputLog(cli.home, vite, '  Local:   http://localhost:5173/\r\n');
  plantOutputLog(
    cli.home,
    next,
    'ready - started server on 0.0.0.0:3000, url: http://localhost:3000\r\n',
  );
  const prior = cli.run;
  cli.run = (file, args, ms, options) =>
    file === 'lsof'
      ? Promise.resolve({ ok: true, stdout: 'p812\nn127.0.0.1:3000\n' })
      : prior(file, args, ms, options);

  const { json, code } = await mesa('ports', '--json');
  expect(code).toBe(0);
  expect(json.data.ports).toEqual([
    {
      session: next,
      sessionName: next,
      url: 'http://localhost:3000/',
      host: 'localhost',
      port: 3000,
      listening: true,
    },
    {
      session: vite,
      sessionName: vite,
      url: 'http://localhost:5173/',
      host: 'localhost',
      port: 5173,
      listening: false,
    },
  ]);
  expect((await mesa('ports', quiet, '--json')).json.data).toEqual({ ports: [] });
  expect((await mesa('ports', vite)).stdout).toBe(
    `http://localhost:5173/  closed  ${vite} ${vite}\n`,
  );
  expect(await mesa('ports', 'zzzzzzzz')).toMatchObject({ code: 3 });
  expect((await mesa('help', '--agent')).stdout).toContain('mesa ports');
});
