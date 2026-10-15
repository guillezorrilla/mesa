// The Worker entrypoint: the only place that picks the real fetch and rate limiter (ADR-0008).
import { type Env, handle } from './broker.js';
import { type D1, d1Installs } from './installs-d1.js';
import { unlimited } from './limit.js';

/** Cloudflare's rate-limit binding: FEEDBACK_LIMIT and INSTALLS_LIMIT in wrangler.toml. */
type RateLimiter = { limit: (options: { key: string }) => Promise<{ success: boolean }> };

const limitOf = (limiter: RateLimiter | undefined) =>
  limiter ? async (key: string) => (await limiter.limit({ key })).success : unlimited;

export default {
  fetch: (request: Request, env: Env) => {
    // Bindings arrive on env beside the string secrets; without a rate limit (self-hosted) nothing
    // is limited, and without the D1 database the install routes answer not_configured.
    const bindings = env as unknown as {
      FEEDBACK_LIMIT?: RateLimiter;
      INSTALLS_LIMIT?: RateLimiter;
      DB?: D1;
    };
    return handle(
      request,
      env,
      (url, init) => fetch(url, init),
      limitOf(bindings.FEEDBACK_LIMIT),
      bindings.DB && {
        store: d1Installs(bindings.DB),
        limit: limitOf(bindings.INSTALLS_LIMIT),
        now: () => new Date(),
      },
    );
  },
};
