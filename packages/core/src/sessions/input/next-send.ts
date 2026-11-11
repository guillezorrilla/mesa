// Which review notes the next send holds. Pure, so the app bundles it (`@mesa/core/browser`).

/**
 * A note the next send holds: an unsent one whose lines are still there, or a sent one not yet
 * resolved (still open), whatever its lines did since.
 */
export const inNextSend = (n: { sentAt?: string; stale: boolean }) => Boolean(n.sentAt) || !n.stale;
