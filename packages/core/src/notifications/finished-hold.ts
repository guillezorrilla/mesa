/**
 * How long a finished turn's banner waits, so the app can first mark read the session it shows in
 * a focused window (CONTEXT.md, Unread); the app delivers again once it is over (#895).
 * shortcut: a guess at two looks and a mark; raise it if a watched session still banners.
 */
export const FINISHED_HOLD_MS = 5_000;
