import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);

test("impact shows a session's guardrail Moments under the summary, by profile, project and session", async () => {
  cli.withTmux();
  await cli.withProject();
  const id = (await cli.mesa('open', 'lantern-cove', '--json')).json.data.id as string;
  expect((await cli.mesa('impact', '--json')).json.data).toMatchObject({
    days: 7,
    summary: { stopped: 0, sessions: 0 },
    sentence:
      'Nothing yet. Moments appear when Mesa catches a question, brings a note in, stops a command or keeps a note.',
    sessions: [],
  });
  expect((await cli.mesa('send', id, 'run rm -rf /')).code).toBe(5);
  expect((await cli.mesa('send', id, 'run rm -rf /', '--force')).code).toBe(0);

  const report = (await cli.mesa('impact', '--json')).json.data;
  expect(report.summary).toMatchObject({ stopped: 2, sessions: 1 });
  expect(report.sentence).toBe(
    'In the last 7 days, Mesa stopped 2 risky commands, across 1 session.',
  );
  expect(report.sessions).toHaveLength(1);
  expect(report.sessions[0]).toMatchObject({ id, project: 'lantern-cove' });
  expect(
    report.sessions[0].moments.map((m: { outcome: { kind: string } }) => m.outcome.kind),
  ).toEqual(['not-overridden', 'overridden']);
  const text = (await cli.mesa('impact')).stdout;
  expect(text).toContain('In the last 7 days, Mesa stopped 2 risky commands, across 1 session.');
  expect(text).toContain(
    'Stopped: the text holds a destructive command (rm -rf). You did not override it',
  );

  const scoped = (await cli.mesa('impact', '--project', 'lantern-cove', '--days', '30', '--json'))
    .json.data;
  expect(scoped).toMatchObject({ days: 30, project: 'lantern-cove', summary: { stopped: 2 } });
  expect(scoped.sentence).toContain('In the last 30 days in lantern-cove, Mesa');
  expect((await cli.mesa('impact', '--session', id, '--json')).json.data.sessions[0].id).toBe(id);
});

test('an unknown project or session is not found, named', async () => {
  await cli.withProject();
  expect(await cli.mesa('impact', '--project', 'nowhere')).toMatchObject({
    code: 3,
    stderr: 'no project named nowhere; see mesa projects\n',
  });
  const missing = await cli.mesa('impact', '--session', 'zz99zz99');
  expect(missing.code).toBe(3);
  expect(missing.stderr).toContain('zz99zz99');
});
