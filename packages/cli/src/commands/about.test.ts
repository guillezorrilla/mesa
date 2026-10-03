import { fakeRelease } from '@mesa/core/testing';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test('about prints the version, build, links and the attribution count; --json the whole object', async () => {
  cli.deps = { release: fakeRelease() };
  const out = await cli.mesa('about');
  expect(out.code).toBe(0);
  expect(out.stdout).toBe(
    [
      'Mesa 0.1.0-beta.4 (build 512), MIT license',
      'Docs      https://github.com/guillezorrilla/mesa#readme',
      'Support   https://github.com/guillezorrilla/mesa/issues',
      'Releases  https://github.com/guillezorrilla/mesa/releases',
      '4 third-party attributions: mesa about licenses',
      '',
    ].join('\n'),
  );
  const { data } = (await cli.mesa('about', '--json')).json;
  expect(data).toMatchObject({ version: '0.1.0-beta.4', build: '512', license: 'MIT' });
  expect(data.links.releases).toBe('https://github.com/guillezorrilla/mesa/releases');
  expect(data.attributions).toHaveLength(4);
  expect(data.attributions[2]).toMatchObject({ name: 'tauri', source: 'crate' });
  expect(data.attributions[2].text).toContain('Apache License');
});

test('about licenses prints each attribution with its version and license', async () => {
  cli.deps = { release: fakeRelease() };
  expect((await cli.mesa('about', 'licenses')).stdout).toBe(
    [
      'node           26.10.0  MIT',
      'harbor-lights  2.4.1    MIT',
      'tauri          2.11.0   Apache-2.0 OR MIT',
      'tide-tables    3ccff53  MIT',
      '',
    ].join('\n'),
  );
});

test('a development mesa says build dev and why it lists no attributions', async () => {
  const out = await cli.mesa('about');
  expect(out.stdout).toContain('(build dev)');
  expect(out.stdout).toContain('0 third-party attributions');
  expect(out.stdout).toContain('scripts/release/licenses.mjs');
  expect((await cli.mesa('about', 'licenses')).stdout).toContain('development build');
});
