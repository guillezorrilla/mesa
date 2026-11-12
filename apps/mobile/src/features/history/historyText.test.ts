import { expect, test } from 'vitest';
import { conversationAction, conversationDetail, historyNote } from './historyText';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const c = {
  project: 'lantern-cove',
  agent: 'claude',
  id: '5b1e2f40',
  title: 'Chart the tides',
  at: '2026-11-12T09:00:00.000Z',
  elsewhere: false,
};

test("a conversation's line names its project, agent and age, and what a tap does", () => {
  expect(conversationDetail(c, NOW)).toBe('lantern-cove · Claude Code · 3h');
  expect(conversationDetail({ ...c, agent: 'codex', at: undefined }, NOW)).toBe(
    'lantern-cove · Codex',
  );
  expect(conversationAction(c)).toBe('Resume');
  expect(conversationAction({ ...c, importedAs: 'a1b2c3d4' })).toBe('Open');
  expect(conversationAction({ ...c, elsewhere: true })).toBe('Other profile');
});

test('the list says why it is empty, and when it shows only the newest', () => {
  expect(historyNote('', 0, false)).toBe('No past conversations on your Mac.');
  expect(historyNote('tide', 0, false)).toBe('No conversation says "tide".');
  expect(historyNote('', 30, true)).toBe('The newest 30 shown.');
  expect(historyNote('', 3, false)).toBeUndefined();
});
