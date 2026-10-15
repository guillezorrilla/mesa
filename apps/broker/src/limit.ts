// Per-caller rate limits: the Worker's rate-limit bindings, keyed by the caller's IP address.

/** Whether one more request from `key` may pass: a rate-limit binding, or a fake in tests. */
export type Limit = (key: string) => Promise<boolean>;

/** A broker without the binding (self-hosted) limits nothing. */
export const unlimited: Limit = async () => true;

/** The key a request is limited by: its IP address, which the broker never keeps. */
export const callerKey = (request: Request) => request.headers.get('cf-connecting-ip') ?? 'unknown';
