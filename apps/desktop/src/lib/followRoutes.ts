import { followedSession } from '@mesa/core/browser';
import type { Bridge } from './client';

/**
 * Runs one chat action over its session's open follow; the envelope it printed. Throws when the
 * follow cannot take it (nothing was sent).
 */
export type FollowRoute = (args: string[]) => Promise<unknown>;

/** The open follows' routes by session: useFollowedChat adds its own while its follow runs. */
export type FollowRoutes = Map<string, FollowRoute>;

/**
 * `bridge`, with a chat action (followedSession) for a session whose chat follow is open sent over
 * that follow instead: `mesa chat --follow` runs it in its own process, so no mesa starts. When the
 * follow cannot take it, the bridge runs it as before.
 */
export const routedBridge =
  (bridge: Bridge, routes: FollowRoutes): Bridge =>
  async (args, stdin) => {
    const session = stdin === undefined ? followedSession(args) : undefined;
    const route = session === undefined ? undefined : routes.get(session);
    if (!route) return bridge(args, stdin);
    try {
      return await route(args);
    } catch {
      return bridge(args, stdin);
    }
  };

/**
 * How long a request waits for its reply before it is called lost: well past a model change's
 * 10 s confirm, as a lost one may still run.
 */
const REPLY_MS = 60_000;

/**
 * The route over one follow, which `write` sends request lines to: `answered` settles a request
 * with its `reply` line, `end` settles every one still out as lost (the follow ended, or it never
 * answered), whose action may or may not have run.
 */
export function followRoute(write: (line: string) => Promise<void>) {
  const out = new Map<
    string,
    { resolve: (reply: unknown) => void; timer: ReturnType<typeof setTimeout> }
  >();
  let next = 0;
  const lost = (message: string) => ({ ok: false, error: { code: 'agent_unavailable', message } });
  /** Ends request `id`: with `reply`, or (none) as never sent. */
  const settle = (id: string, reply?: unknown) => {
    const request = out.get(id);
    out.delete(id);
    if (!request) return;
    clearTimeout(request.timer);
    if (reply !== undefined) request.resolve(reply);
  };
  const route: FollowRoute = async (args) => {
    next += 1;
    const id = `r${next}`;
    const reply = new Promise<unknown>((resolve) => {
      const timer = setTimeout(
        () => settle(id, lost("the chat's stream did not answer; look before trying again")),
        REPLY_MS,
      );
      out.set(id, { resolve, timer });
    });
    const argv = args[0] === '--json' ? args.slice(1) : args;
    try {
      await write(JSON.stringify({ type: 'run', id, argv }));
    } catch (failed) {
      settle(id);
      throw failed;
    }
    return reply;
  };
  return {
    route,
    answered: settle,
    end: () => {
      for (const id of [...out.keys()])
        settle(id, lost("the chat's stream ended before it answered; look before trying again"));
    },
  };
}
