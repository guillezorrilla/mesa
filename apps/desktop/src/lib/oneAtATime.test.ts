import { expect, test } from 'vitest';
import { oneAtATime } from './oneAtATime';

test('two size changes during one resize end in one more resize, with the last size', async () => {
  let size = '80x24';
  const sent: string[] = [];
  const done: (() => void)[] = [];
  const resize = oneAtATime(async () => {
    sent.push(size);
    await new Promise<void>((resolve) => done.push(resolve));
  });
  const first = resize();
  size = '100x30';
  await resize();
  size = '120x40';
  await resize();
  expect(sent).toEqual(['80x24']);

  done[0]?.();
  await new Promise((resolve) => setTimeout(resolve));
  expect(sent).toEqual(['80x24', '120x40']);
  done[1]?.();
  await first;
  expect(sent).toEqual(['80x24', '120x40']);

  // Idle again: the next call runs at once.
  size = '90x20';
  const next = resize();
  expect(sent.at(-1)).toBe('90x20');
  done[2]?.();
  await next;
});

test('a run that throws frees the queue for the next call', async () => {
  let calls = 0;
  const run = oneAtATime(async () => {
    calls += 1;
    if (calls === 1) throw new Error('boom');
  });
  await expect(run()).rejects.toThrow('boom');
  await run();
  expect(calls).toBe(2);
});
