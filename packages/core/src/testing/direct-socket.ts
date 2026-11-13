import type { ConnectSocket } from '../phone/protocol/mailbox.js';
import type { DirectAccept, DirectListen } from '../phone/serve/direct-socket.js';

/** The Mac's addresses the fake offers: a tailnet's, then a LAN's. */
export const FAKE_DIRECT_HOSTS = ['100.100.1.2', '192.168.1.20'];

/**
 * The Mac's direct socket in memory (#1129): `listen` is the listener's DirectListen, and `connect`
 * wraps the broker's so a `ws://` URL dials it. `down` closes it and refuses dials, as a stopped
 * socket or another network does; `silent` drops every frame and leaves dials unanswered, as a
 * black-holed LAN or a socket dead with no close does; `up` takes dials again. `frames` counts
 * the frames the phone sent on the direct path, `dials` the sockets it opened to it.
 */
export function fakeDirectSocket(port = 7777) {
  let accept: DirectAccept | undefined;
  let mode: 'up' | 'down' | 'silent' = 'up';
  let frames = 0;
  let dials = 0;
  const open = new Set<() => void>();
  const listen: DirectListen = async (taking) => {
    accept = taking;
    return {
      port,
      hosts: () => FAKE_DIRECT_HOSTS,
      close: () => {
        accept = undefined;
        for (const close of [...open]) close();
      },
    };
  };
  const connect =
    (broker: ConnectSocket): ConnectSocket =>
    (url, on) => {
      if (!url.startsWith('ws://')) return broker(url, on);
      dials += 1;
      const taking = accept;
      if (mode === 'silent') return { send: () => {}, close: () => queueMicrotask(on.close) };
      if (mode === 'down' || !taking) {
        queueMicrotask(on.close);
        return { send: () => {}, close: () => {} };
      }
      let closed = false;
      const close = () => {
        if (closed) return;
        closed = true;
        open.delete(close);
        queueMicrotask(on.close);
        queueMicrotask(peer.close);
      };
      const live = () => !closed && mode !== 'silent';
      const peer = taking({
        send: (data) => live() && queueMicrotask(() => on.message(data)),
        close,
      });
      open.add(close);
      queueMicrotask(on.open);
      const send = (data: string) => {
        if (!live()) return;
        frames += 1;
        queueMicrotask(() => peer.message(data));
      };
      return { send, close };
    };
  return {
    listen,
    connect,
    down: () => {
      mode = 'down';
      for (const close of [...open]) close();
    },
    silent: () => {
      mode = 'silent';
    },
    up: () => {
      mode = 'up';
    },
    frames: () => frames,
    dials: () => dials,
  };
}
