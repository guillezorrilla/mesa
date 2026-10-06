import { expect, test } from 'vitest';
import { defineCommand } from '../command.js';
import { commandReference, referenceMarkdown } from './reference.js';

// Declarations only: the reference reads them, never runs them.
const run = () => ({ data: null, text: '' });
const greet = defineCommand({
  name: 'greet',
  summary: 'Greet someone (a fake command)',
  args: ['who', 'title?'],
  flags: { loud: { type: 'boolean', description: 'Shout' } },
  example: 'mesa greet ada --loud',
  run,
});
const greetAt = defineCommand({
  name: 'greet at',
  summary: 'Greet someone somewhere',
  args: ['who', 'words...'],
  flags: {
    place: { type: 'string', required: true, description: 'Where to greet' },
    wave: { type: 'boolean', description: 'Wave too' },
  },
  example: 'mesa greet at ada --place hall --wave',
  run,
});
const warn = defineCommand({
  name: 'warn',
  summary: 'Succeed with a problem',
  example: 'mesa warn',
  run,
});

test('the agent reference pins its Markdown for fixture commands in two groups', async () => {
  // One made-up global, so the golden file pins the layout and not the real globals' wording.
  const globals = { json: { type: 'boolean' as const, description: 'Print JSON' } };
  const written = referenceMarkdown(commandReference([greet, greetAt, warn]), globals);
  // `vitest -u` rewrites the golden file.
  await expect(written).toMatchFileSnapshot('golden/agent-reference.md');
});
