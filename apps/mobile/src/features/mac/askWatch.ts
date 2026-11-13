import type { MacLink } from './macLink';

/**
 * Asks the Mac to push session `id` to this phone (the `watch` call, #1128): true when it took the
 * watch, false when it did not answer, as a Mac on an older release never does.
 */
export const askWatch = (link: Pick<MacLink, 'call'>, id: string, replies?: number) =>
  link.call({ method: 'watch', id, replies }).then(
    () => true,
    () => false,
  );
