import { expect, test } from 'vitest';
import { confirmText, menuActions } from './menuActions';

test('a live session stops, an ended one resumes, and an archived one only unarchives', () => {
  expect(menuActions('working', false)).toEqual(['stop', 'fork', 'handoff', 'rename', 'archive']);
  expect(menuActions('done', false)[0]).toBe('resume');
  expect(menuActions('idle', true)).toEqual(['unarchive']);
});

test('stop and archive say what they do before they run', () => {
  expect(confirmText('stop', 'Login fix')).toBe(
    'Stop Login fix? Its agent is asked to quit, then its window closes.',
  );
  expect(confirmText('archive', 'Login fix')).toMatch(/^Archive Login fix\?/);
});
