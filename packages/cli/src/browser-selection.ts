import { connect } from 'node:net';
import type { BrowserPageSelection } from '@mesa/core';

/** Query the native app that owns this browser; an absent app cannot authorize a send. */
export function browserSelection(
  socketPath: string,
  session: string,
): Promise<BrowserPageSelection | undefined> {
  return new Promise((resolve) => {
    const socket = connect(socketPath);
    const chunks: Buffer[] = [];
    let bytes = 0;
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('connect', () => socket.end(`${JSON.stringify(session)}\n`));
    socket.on('data', (data: Buffer) => {
      bytes += data.length;
      if (bytes > 8192) socket.destroy();
      else chunks.push(data);
    });
    socket.on('error', () => resolve(undefined));
    socket.on('close', () => {
      try {
        const value: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        if (
          value &&
          typeof value === 'object' &&
          'url' in value &&
          'title' in value &&
          'selector' in value &&
          'text' in value &&
          typeof value.url === 'string' &&
          typeof value.title === 'string' &&
          typeof value.selector === 'string' &&
          typeof value.text === 'string'
        )
          return resolve(value as BrowserPageSelection);
      } catch {
        // Closed or unavailable native browser.
      }
      resolve(undefined);
    });
  });
}
