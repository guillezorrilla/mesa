import { expect, test } from 'vitest';
import { oneAtATime } from './oneAtATime';

const tick = () => new Promise((resolve) => setTimeout(resolve));

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
  const second = resize();
  size = '120x40';
  const third = resize();
  expect(sent).toEqual(['80x24']);

  done[0]?.();
  await first;
  await tick();
  expect(sent).toEqual(['80x24', '120x40']);
  // The calls made meanwhile resolve with the run that covers them, not before it.
  let covered = false;
  second.then(() => (covered = true));
  await tick();
  expect(covered).toBe(false);
  done[1]?.();
  await Promise.all([second, third]);
  expect(sent).toEqual(['80x24', '120x40']);

  // Idle again: the next call runs at once.
  size = '90x20';
  const next = resize();
  expect(sent.at(-1)).toBe('90x20');
  done[2]?.();
  await next;
});

test('a run that throws frees the queue, and the run queued behind it still runs', async () => {
  let calls = 0;
  let fail = () => {};
  const run = oneAtATime(async () => {
    calls += 1;
    if (calls === 1)
      await new Promise<void>((_, reject) => (fail = () => reject(new Error('boom'))));
  });
  const first = run();
  const behind = run();
  fail();
  await expect(first).rejects.toThrow('boom');
  await behind;
  expect(calls).toBe(2);
  await run();
  expect(calls).toBe(3);
});
