import { connect } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { BrowserPageSelection } from '@mesa/core';

/** Query the native app that owns this browser; an absent app cannot authorize a send. */
export function browserSelection(
  pid: number,
  session: string,
): Promise<BrowserPageSelection | undefined> {
  return new Promise((resolve) => {
    const socket = connect(join(tmpdir(), `mesa-browser-${pid}.sock`));
    let response = '';
    socket.setTimeout(3000, () => socket.destroy());
    socket.on('connect', () => socket.end(`${JSON.stringify(session)}\n`));
    socket.on('data', (data: Buffer) => {
      response += data.toString('utf8');
      if (response.length > 8192) socket.destroy();
    });
    socket.on('error', () => resolve(undefined));
    socket.on('close', () => {
      try {
        const value: unknown = JSON.parse(response);
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
