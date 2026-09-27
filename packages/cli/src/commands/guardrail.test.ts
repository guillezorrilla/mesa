import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { beforeEach, expect, test } from 'vitest';
import { cliHarness } from '../testing.js';

const cli = cliHarness();
beforeEach(cli.reset);
const { mesa } = cli;

test('guardrail check prints the verdict, why, and the decision, and writes no receipt', async () => {
  const dir = await cli.withProject();
  const before = (await mesa('receipts', '--json')).json.data.length;

  const hello = await mesa('guardrail', 'check', 'hello', '--json');
  expect(hello.code).toBe(0);
  expect(hello.json.data).toMatchObject({
    verdict: 'allow',
    reason: 'the text holds no secret and no destructive command',
    decision: {
      backend: 'rules',
      answers: [
        { id: 'verdict', kind: 'Choice', answer: 'allow' },
        { id: 'secret-or-destructive', kind: 'Noul', answer: false, probabilities: 0.05 },
      ],
    },
  });
  expect((await mesa('guardrail', 'check', 'git push --force origin main')).stdout).toBe(
    'block: the text holds a destructive command (git push --force)\n',
  );

  writeFileSync(join(dir, 'mesa.yaml'), 'name: lantern-cove\nguardrail: strict\n');
  const strict = await mesa('guardrail', 'check', 'hello', '--project', 'lantern-cove', '--json');
  expect(strict.json.data).toMatchObject({
    verdict: 'ask',
    reason: 'project lantern-cove has guardrail: strict',
  });
  expect((await mesa('receipts', '--json')).json.data).toHaveLength(before);
});
