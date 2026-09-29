import { once } from 'node:events';
import { createServer } from 'node:net';
import { join } from 'node:path';
import { tempDir } from '@mesa/core/testing';
import { expect, test } from 'vitest';
import { browserSelection } from './browser-selection.js';

test('native browser selection keeps UTF-8 intact across socket chunks', async () => {
  const path = join(tempDir(), 'browser.sock');
  const selection = {
    url: 'https://example.test/',
    title: 'Café 🦦',
    selector: 'h1',
    text: 'Violet otter',
  };
  const payload = Buffer.from(JSON.stringify(selection));
  const split = payload.indexOf(Buffer.from('é')) + 1;
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    socket.once('data', () => {
      socket.write(payload.subarray(0, split));
      setTimeout(() => socket.end(payload.subarray(split)), 10);
    });
  });
  server.listen(path);
  await once(server, 'listening');
  try {
    expect(await browserSelection(path, 'abcdefgh')).toEqual(selection);
  } finally {
    server.close();
    await once(server, 'close');
  }
});
