import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { MesaError } from '../lib/result.js';

/** Where a sign-in comes back: a loopback port, the query of its first `/callback`, and close. */
export type CallbackListener = {
  port: number;
  callback: Promise<URLSearchParams>;
  close: () => void;
};
/** Starts a listener: node:http on 127.0.0.1 for real, a planted answer in tests. */
export type CallbackListen = () => Promise<CallbackListener>;

const PAGE =
  '<!doctype html><meta charset="utf-8"><title>Mesa</title><p>Signed in. You can close this tab and return to Mesa.</p>';

/** A listener on a free 127.0.0.1 port that gives up after `timeoutMs`. */
export const loopbackListener =
  (timeoutMs: number): CallbackListen =>
  () =>
    new Promise((resolve, reject) => {
      let answer: (query: URLSearchParams) => void = () => {};
      let fail: (error: Error) => void = () => {};
      const callback = new Promise<URLSearchParams>((res, rej) => {
        answer = res;
        fail = rej;
      });
      const server = createServer((request, response) => {
        const url = new URL(request.url ?? '/', 'http://127.0.0.1');
        if (request.method !== 'GET' || url.pathname !== '/callback') {
          response.writeHead(404, { connection: 'close' }).end();
          return;
        }
        response
          .writeHead(200, { 'content-type': 'text/html; charset=utf-8', connection: 'close' })
          .end(PAGE);
        answer(url.searchParams);
        close();
      });
      const timer = setTimeout(() => {
        fail(new MesaError('timeout', 'the sign-in did not come back in time; try again'));
        close();
      }, timeoutMs);
      const close = () => {
        clearTimeout(timer);
        server.close();
      };
      server.on('error', reject);
      server.listen(0, '127.0.0.1', () =>
        resolve({ port: (server.address() as AddressInfo).port, callback, close }),
      );
    });
