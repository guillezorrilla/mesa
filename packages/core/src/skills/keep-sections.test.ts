import { expect, test } from 'vitest';
import { thrown } from '../testing/index.js';
import { keepSections, restoreKept } from './keep-sections.js';

const MINE = '<!-- keep -->\n## Mine\nCall the harbour master.\n<!-- keep -->';
const OTHER = '<!-- keep -->\nSecond.\n<!-- keep -->';

test('restoreKept keeps a block the agent kept in place, adds back one it dropped or changed, and takes out its own', () => {
  const previous = `# Note\n\n${MINE}\n\nOld text.\n\n${OTHER}\n`;
  expect(restoreKept(`# Note\n\n${MINE}\n\nNew text.`, previous, 'n.md')).toBe(
    `# Note\n\n${MINE}\n\nNew text.\n\n${OTHER}\n`,
  );
  const changed = MINE.replace('master', 'mistress');
  expect(restoreKept(`# Note\n\n${changed}\n\nNew text.`, previous, 'n.md')).toBe(
    `# Note\n\nNew text.\n\n${MINE}\n\n${OTHER}\n`,
  );
  expect(restoreKept('# Note\n\nNew text.', '# Note\n', 'n.md')).toBe('# Note\n\nNew text.\n');
});

test('restoreKept refuses keep markers that do not pair, in the note or in the agent output', () => {
  expect(thrown(() => restoreKept('x', '<!-- keep -->\nopen', 'n.md')).message).toBe(
    'n.md has an unmatched <!-- keep --> marker',
  );
  expect(thrown(() => restoreKept('x <!-- keep -->', '', 'n.md')).message).toBe(
    'the agent output has an unmatched <!-- keep --> marker',
  );
  // keepSections still refuses any marker in the agent's output.
  expect(thrown(() => keepSections(MINE, MINE, 'n.md')).message).toBe(
    'agent output contains a keep marker',
  );
});
