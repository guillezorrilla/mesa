// The Worker entrypoint: the only place that picks the real fetch and rate limiter (ADR-0008).
import { type Env, handle } from './broker.js';

/** Cloudflare's rate-limit binding, FEEDBACK_LIMIT in wrangler.toml. */
type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

export default {
  fetch: (request: Request, env: Env) => {
    // Bindings arrive on env beside the string secrets; without one (self-hosted), handle limits none.
    const limiter = (env as unknown as { FEEDBACK_LIMIT?: RateLimiter }).FEEDBACK_LIMIT;
    return handle(
      request,
      env,
      (url, init) => fetch(url, init),
      limiter && (async (key) => (await limiter.limit({ key })).success),
    );
  },
};
