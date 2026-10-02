// The Worker entrypoint: the only place that picks the real fetch (ADR-0008).
import { type Env, handle } from './broker.js';

export default {
  fetch: (request: Request, env: Env) => handle(request, env, (url, init) => fetch(url, init)),
};
