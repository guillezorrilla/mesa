import type { MacLink } from './macLink';

/**
 * Asks the Mac to push session `id` to this phone (the `watch` call, #1128): its detail with
 * `replies` of them, and what its window prints while `stream` (the output terminal, #1146); a
 * value left out keeps what an earlier ask set. True when the Mac took the watch, false when it
 * did not answer, as a Mac on an older release never does.
 */
export const askWatch = (
  link: Pick<MacLink, 'call'>,
  id: string,
  replies?: number,
  stream?: boolean,
) =>
  link.call({ method: 'watch', id, replies, stream }).then(
    () => true,
    () => false,
  );
