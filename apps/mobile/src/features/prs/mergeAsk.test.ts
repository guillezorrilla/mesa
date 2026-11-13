import { expect, test } from 'vitest';
import { mergeAsk, refusedAsk } from './mergeAsk';

test('passing checks merge plainly, naming the method and the checks', () => {
  const ask = mergeAsk(
    { number: 7, checks: 'passing', checkList: [{ name: 'test', state: 'passing' }] },
    'rebase',
  );
  expect(ask).toEqual({
    title: 'Rebase and merge #7?',
    message: 'Checks: 1 passing.',
    action: 'Merge',
    confirm: false,
  });
});

test('a failing check names the failures and asks Merge anyway, with the confirm', () => {
  const ask = mergeAsk(
    {
      number: 7,
      checks: 'failing',
      checkList: [
        { name: 'lint', state: 'failing' },
        { name: 'test', state: 'passing' },
      ],
    },
    'squash',
  );
  expect(ask).toMatchObject({
    message: 'Failing: lint. Merge anyway?',
    action: 'Merge anyway',
    confirm: true,
  });
});

test('running checks and no checks say so', () => {
  expect(mergeAsk({ number: 7, checks: 'pending', checkList: [] }, 'squash').message).toBe(
    'Checks are still running.',
  );
  expect(mergeAsk({ number: 7, checks: null, checkList: [] }, 'merge').message).toBe(
    'Checks: No checks.',
  );
});

test('a refusal from the Mac is asked again in words', () => {
  expect(refusedAsk('conflicting')).toBe(
    'It conflicts with its base, so GitHub may refuse it too. Merge anyway?',
  );
  expect(refusedAsk('checks-failing')).toContain('Merge anyway?');
});
