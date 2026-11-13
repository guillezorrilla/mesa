import { expect, test } from 'vitest';
import {
  fakeDirectSocket,
  fixedClock,
  manualTimers,
  servingPhone,
  untilTrue,
} from '../../testing/index.js';
import { HEAD_START_MS, RETRY_MS } from '../protocol/direct-path.js';
import { MacCallError } from '../protocol/requests.js';

/** A paired phone whose Mac also has its own socket, on time a test moves. */
const servingDirect = async () => {
  const direct = fakeDirectSocket();
  const timers = manualTimers(fixedClock()().getTime());
  const at = await servingPhone(undefined, { direct, timers });
  return { ...at, direct, timers };
};

test('the phone asks the Mac over the relay where its socket is, then talks to it directly', async () => {
  const at = await servingDirect();
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);
  // The Mac offers its tailnet address first; on the same network either answers.
  expect(at.paths).toEqual(['tailscale']);
  const before = at.direct.frames();
  const { rows } = await at.calls.call({ method: 'sessions' });
  expect(rows.map((row) => row.id)).toEqual([at.session.id]);
  expect(at.direct.frames()).toBe(before + 1);
  await at.end();
});

test('a direct socket that does not answer within the head start leaves the phone on the relay', async () => {
  const direct = fakeDirectSocket();
  direct.silent();
  const timers = manualTimers(fixedClock()().getTime());
  const at = await servingPhone(undefined, { direct, timers });
  // The ask went out by the relay (nothing dialed yet); its answer starts the dial.
  expect(await untilTrue(() => direct.dials() > 0)).toBe(true);
  const asked = at.calls.call({ method: 'sessions' });
  await timers.pass(HEAD_START_MS);
  expect((await asked).rows).toHaveLength(1);
  expect(at.line.path()).toBe('relay');
  await at.end();
});

test('when the direct socket drops, calls go by the relay, and after the wait the phone is direct again', async () => {
  const at = await servingDirect();
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);

  at.direct.down();
  expect(await untilTrue(() => at.line.path() === 'relay')).toBe(true);
  const before = at.direct.frames();
  expect((await at.calls.call({ method: 'sessions' })).rows).toHaveLength(1);
  expect(at.direct.frames()).toBe(before);

  at.direct.up();
  await at.timers.pass(RETRY_MS);
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);
  expect(at.paths).toEqual(['tailscale', 'relay', 'tailscale']);
  await at.end();
});

test('a call the direct path leaves unanswered is reported, the path drops, and the next one is answered', async () => {
  const at = await servingDirect();
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);

  // The socket dies with no close, as a Wi-Fi left behind does.
  at.direct.silent();
  const lost = at.calls.call({ method: 'sessions' }).catch((error) => error);
  await at.timers.pass(10_000);
  expect(await lost).toBeInstanceOf(MacCallError);
  expect(at.line.path()).toBe('relay');
  expect((await at.calls.call({ method: 'sessions' })).rows).toHaveLength(1);
  await at.end();
});

test('a call in flight when the direct socket closes is answered by the relay', async () => {
  const at = await servingDirect();
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);
  const asked = at.calls.call({ method: 'sessions' });
  at.direct.down();
  expect((await asked).rows).toHaveLength(1);
  await at.end();
});

test('a Mac with no direct socket answers the ask with nothing, and the phone stays on the relay', async () => {
  const timers = manualTimers(fixedClock()().getTime());
  const at = await servingPhone(undefined, { timers });
  expect((await at.calls.call({ method: 'sessions' })).rows).toHaveLength(1);
  await timers.pass(RETRY_MS);
  expect(at.line.path()).toBe('relay');
  expect(at.paths).toEqual([]);
  await at.end();
});

test('a retry dial that never opens holds no call: it goes by the relay at once', async () => {
  const at = await servingDirect();
  expect(await untilTrue(() => at.line.path() !== 'relay')).toBe(true);
  at.direct.down();
  expect(await untilTrue(() => at.line.path() === 'relay')).toBe(true);
  at.direct.silent();
  const dials = at.direct.dials();
  await at.timers.pass(RETRY_MS);
  expect(await untilTrue(() => at.direct.dials() > dials)).toBe(true);
  expect((await at.calls.call({ method: 'sessions' })).rows).toHaveLength(1);
  await at.end();
});
