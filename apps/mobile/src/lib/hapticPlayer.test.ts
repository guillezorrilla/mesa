import { expect, test } from 'vitest';
import { type Feel, hapticPlayer } from './hapticPlayer';

const recorder = (on: boolean) => {
  const played: string[] = [];
  const play = hapticPlayer({
    on: () => on,
    notify: async (type) => void played.push(`notify:${type}`),
    select: async () => void played.push('select'),
  });
  return { played, play };
};

test('success, warning and error play notifications, and selection plays selection feedback', () => {
  const { played, play } = recorder(true);
  for (const feel of ['success', 'warning', 'error', 'selection'] as Feel[]) play(feel);
  expect(played).toEqual(['notify:success', 'notify:warning', 'notify:error', 'select']);
});

test('nothing plays once the person turned haptics off', () => {
  const { played, play } = recorder(false);
  play('success');
  play('selection');
  expect(played).toEqual([]);
});

test('a failed play is swallowed, not thrown into the action that played it', async () => {
  const play = hapticPlayer({
    on: () => true,
    notify: () => Promise.reject(new Error('no engine')),
    select: () => Promise.reject(new Error('no engine')),
  });
  expect(() => play('error')).not.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0));
});
