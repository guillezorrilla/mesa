import { MacCallError } from '@mesa/core/phone';
import { expect, test } from 'vitest';
import { againOnTimeout } from './againOnTimeout';

const asking = (...answers: (number | Error)[]) => {
  let asked = 0;
  const ask = async () => {
    const answer = answers[asked++];
    if (answer instanceof Error) throw answer;
    return answer;
  };
  return { ask, asked: () => asked };
};
const late = () => new MacCallError('timeout', 'the Mac did not answer in time');

test('a read that timed out is asked once more, and its second answer counts', async () => {
  const read = asking(late(), 7);
  expect(await againOnTimeout(read.ask)).toBe(7);
  expect(read.asked()).toBe(2);
});

test('a read that times out twice fails; one the Mac refused is not asked again', async () => {
  const twice = asking(late(), late());
  await expect(againOnTimeout(twice.ask)).rejects.toThrow('did not answer in time');
  expect(twice.asked()).toBe(2);
  const refused = asking(new MacCallError('failed', 'no session ab12cd34'));
  await expect(againOnTimeout(refused.ask)).rejects.toThrow('no session');
  expect(refused.asked()).toBe(1);
});
