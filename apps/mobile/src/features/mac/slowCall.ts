/**
 * How long a call that can run long gets, against the 10 s most calls get: a large diff on a busy
 * Mac, a commit that runs hooks, a push or pull, an agent writing a commit message.
 */
export const SLOW_MS = 90_000;
