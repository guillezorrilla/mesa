import { expect, test } from 'vitest';
import { parseContextReport } from './context-report.js';

// Invented numbers in the shape claude 2.1.325's `/context` prints in Structured mode.
const REPLY = [
  '## Context Usage',
  '',
  '**Model:** claude-lantern-1  ',
  '**Tokens:** 23.1k / 1m (2%)',
  '',
  '### Estimated usage by category',
  '',
  '| Category | Tokens | Percentage |',
  '|----------|--------|------------|',
  '| System prompt | 3.3k | 0.3% |',
  '| Messages | 3.1k | <0.1% |',
  '| Free space | 943.9k | 94.4% |',
  '',
  '### MCP Tools',
  '',
  '| Tool | Server | Tokens |',
  '|------|--------|--------|',
  '| mcp__cove__chart | cove | 644 |',
].join('\n');

test('reads the model, the tokens used of the window, and the categories table alone', () => {
  expect(parseContextReport(REPLY)).toEqual({
    model: 'claude-lantern-1',
    used: '23.1k',
    window: '1m',
    percent: 2,
    categories: [
      { name: 'System prompt', tokens: '3.3k', share: '0.3%', percent: 0.3 },
      { name: 'Messages', tokens: '3.1k', share: '<0.1%', percent: 0.1 },
      { name: 'Free space', tokens: '943.9k', share: '94.4%', percent: 94.4 },
    ],
  });
});

test('a reply with tokens and no table reads with no categories; other text is no report', () => {
  expect(parseContextReport('**Tokens:** 1k / 200k (0.5%)')).toEqual({
    used: '1k',
    window: '200k',
    percent: 0.5,
    categories: [],
  });
  expect(parseContextReport('No context yet.')).toBeUndefined();
});
