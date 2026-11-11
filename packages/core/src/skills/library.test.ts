import { expect, test } from 'vitest';
import { claudeRunProfile } from './library.js';

test("Mesa's own skill runs each have one profile: model, MCP server and effort; any other skill has none", () => {
  expect(claudeRunProfile('vault-capture')).toEqual({ model: 'haiku', mcp: 'vault' });
  expect(claudeRunProfile('import-notes')).toEqual({ model: 'sonnet', mcp: 'vault' });
  expect(claudeRunProfile('git-text')).toEqual({ model: 'haiku', mcp: 'none', effort: 'low' });
  expect(claudeRunProfile('session-summary')).toEqual({
    model: 'haiku',
    mcp: 'none',
    effort: 'low',
  });
  expect(claudeRunProfile('project-brief')).toBeUndefined();
  // Never an inherited property of the table.
  expect(claudeRunProfile('toString')).toBeUndefined();
});
