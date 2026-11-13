import { expect, test } from 'vitest';
import { withoutChrome } from './screenChrome';

const said = ['⏺ Tests pass. Opened PR #12.', '  ⎿  2 files changed', '✻ Worked for 3m 12s'];

test("Claude Code's footer under its last reply is dropped, the reply kept", () => {
  expect(
    withoutChrome([
      ...said,
      '────────────────────────────────',
      '❯',
      '────────────────────────────────',
      '  ada@studio-mac ~/code/kettle',
      '  ⏵⏵ auto mode on (shift+tab to cycle) · ⧉2 · ← 1 agent',
      '  Image in clipboard · ctrl+v to paste',
    ]),
  ).toEqual(said);
});

test('each chrome line goes wherever the redraws left it', () => {
  expect(
    withoutChrome([
      '❯ ',
      said[0] ?? '',
      '  ⏵⏵ accept edits on (shift+tab to cycle)',
      '  ? for shortcuts',
      '›',
      '  100% context left',
      '━━━━━━━━━━',
    ]),
  ).toEqual([said[0]]);
});

test("a prompt with words, a dialog's choice and the agent's own lines stay", () => {
  const kept = ['❯ fix the flaky test', '❯ 1. Yes', '  2. No', 'a - b', '> quoted', '---'];
  expect(withoutChrome(kept)).toEqual(kept);
});

test('a line after a rule stays unless a chrome line follows it', () => {
  const kept = ['──────', 'Summary of the run', 'All green.'];
  expect(withoutChrome(kept)).toEqual(['Summary of the run', 'All green.']);
});
