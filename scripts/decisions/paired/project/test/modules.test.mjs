import assert from 'node:assert/strict';
import { test } from 'node:test';

test('every module loads', async () => {
  for (const file of ['money', 'ids', 'manifest', 'log', 'shipments', 'weights']) {
    assert.ok(await import(`../src/${file}.js`));
  }
});
