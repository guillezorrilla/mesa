import { expect, test } from 'vitest';
import { claudeRunProfile } from './library.js';

test("Mesa's own skill runs each have one profile: model, vault access and effort; any other skill has none", () => {
  expect(claudeRunProfile('vault-capture')).toEqual({ model: 'haiku', vault: true });
  expect(claudeRunProfile('import-notes')).toEqual({ model: 'sonnet', vault: true });
  expect(claudeRunProfile('git-text')).toEqual({ model: 'haiku', vault: false, effort: 'low' });
  expect(claudeRunProfile('session-summary')).toEqual({
    model: 'haiku',
    vault: false,
    effort: 'low',
  });
  expect(claudeRunProfile('project-brief')).toBeUndefined();
  // Never an inherited property of the table.
  expect(claudeRunProfile('toString')).toBeUndefined();
});
