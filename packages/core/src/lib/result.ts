// The envelope every `mesa --json` command prints and the app's run_mesa bridge returns.

export const EXIT_CODES = {
  ok: 0,
  internal: 1,
  usage: 2,
  not_found: 3,
  invalid_config: 4,
  guardrail_blocked: 5,
  tmux_unavailable: 6,
  agent_unavailable: 7,
  /** A note marked `locked: true`, or a vault lock another process holds. */
  locked: 8,
} as const;

export type ErrorCode = Exclude<keyof typeof EXIT_CODES, 'ok'>;

type MesaErrorBody = { code: ErrorCode; message: string; details?: unknown };
type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; error: MesaErrorBody };
export type Result<T> = Ok<T> | Fail;

export class MesaError extends Error {
  readonly code: ErrorCode;
  readonly details?: unknown;

  constructor(code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.name = 'MesaError';
    this.code = code;
    this.details = details;
  }
}

export function ok<T>(data: T): Ok<T> {
  return { ok: true, data };
}

export function fail(code: ErrorCode, message: string, details?: unknown): Fail {
  return {
    ok: false,
    error: details === undefined ? { code, message } : { code, message, details },
  };
}

/** A thrown MesaError keeps its code; anything else is `internal`. */
export function toFail(error: unknown): Fail {
  if (error instanceof MesaError) return fail(error.code, error.message, error.details);
  return fail('internal', error instanceof Error ? error.message : String(error));
}

export function exitCode(result: Result<unknown>): number {
  return result.ok ? EXIT_CODES.ok : EXIT_CODES[result.error.code];
}
