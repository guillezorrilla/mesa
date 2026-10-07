import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fetchManifest } from '../src/manifest.js';

/** A fetch answering `statuses` in turn (the last one again after that), counting its calls. */
function courier(statuses) {
  const seen = { calls: 0 };
  seen.fetch = async () => {
    const status = statuses[Math.min(seen.calls, statuses.length - 1)];
    seen.calls += 1;
    return new Response(JSON.stringify({ parcels: 3 }), { status });
  };
  return seen;
}

test('a 503 is retried, at most 3 times', async () => {
  const flaky = courier([503, 503, 503, 200]);
  assert.deepEqual(await fetchManifest('https://courier.invalid/m', flaky), { parcels: 3 });
  assert.equal(flaky.calls, 4);
  const down = courier([503]);
  await assert.rejects(fetchManifest('https://courier.invalid/m', down), /503/);
  assert.equal(down.calls, 4);
});

test('any other failure fails at once, with its status', async () => {
  for (const status of [404, 401, 500]) {
    const refused = courier([status, 200]);
    await assert.rejects(fetchManifest('https://courier.invalid/m', refused), new RegExp(status));
    assert.equal(refused.calls, 1);
  }
});
