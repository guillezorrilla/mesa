import type { Agent } from '../agents/names.js';
import type { Decision, DecisionRecorder } from '../decisions/types.js';
import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';
import { toFail } from '../lib/result.js';
import { acceptsMesaWrites } from '../vault/vault.js';
import { decisionEntries, type ReceiptInput } from './schema.js';
import { writeReceipt } from './store.js';

/** What one action's receipt says, given the action's result. */
type ActionSpec<T> = {
  /** `action` unless the work is a session's, or a skill run's. */
  type?: 'action' | 'session' | 'skill';
  summary: (result: T) => string;
  /** The summary when the action throws. */
  failure: string;
  inputs: Record<string, unknown>;
  /** The argv to record instead of the invocation's (send shortens its prompt). */
  argv?: readonly string[];
  outputs?: (result: T) => Record<string, unknown>;
  project?: (result: T) => string | undefined;
  session?: (result: T) => string | undefined;
  agent?: (result: T) => Agent | undefined;
  /** False when the action changed nothing: then no receipt. */
  changed?: (result: T) => boolean;
  /** The action's own warning, joined before its receipt's into the Recorded one. */
  warning?: (result: T) => string | undefined;
};

/** The action's result, the receipt it left (if any), and why there is none when writing failed. */
export type Recorded<T> = {
  result: T;
  receipt: { id: string; path: string } | null;
  warning?: string;
};

/** Warnings joined into one, the empty ones dropped; none when every one is. */
export const joinWarnings = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join('; ') || undefined;

/**
 * Runs actions, sync or async, and records each as a receipt (`action` unless the spec says
 * `session` or `skill`). Each action is handed a DecisionRecorder: every Faro decision made on it
 * lands in the receipt's `decisions`. A failed action is recorded `failed`, or `blocked` when a
 * guardrail stopped it (best effort), and rethrown. A receipt never fails the action it records:
 * when the vault cannot take one, the result carries a warning, after the action's own (`warning`).
 */
export function actionRecorder(deps: {
  profile: string;
  /** The vault path, or undefined when the profile has none yet. */
  vault: () => string | undefined;
  clock: Clock;
  newId: IdSource;
  /** The redacted command line of `argv`, else of this invocation. */
  command: (argv?: readonly string[]) => string;
}) {
  // Everything here is guarded: a receipt problem never escapes into the action's outcome.
  const write = (
    input: Omit<ReceiptInput, 'profile' | 'command' | 'decisions'>,
    made: readonly Decision[],
    argv?: readonly string[],
  ): Omit<Recorded<unknown>, 'result'> => {
    try {
      const vault = deps.vault();
      if (!vault) return { receipt: null, warning: 'no receipt: the profile has no vault yet' };
      if (!acceptsMesaWrites(vault)) {
        return {
          receipt: null,
          warning: `no receipt: ${vault} is not a vault; run mesa vault init`,
        };
      }
      const { receipt, path, warning } = writeReceipt(
        { vault, clock: deps.clock, newId: deps.newId },
        {
          profile: deps.profile,
          command: deps.command(argv),
          decisions: made.flatMap(decisionEntries),
          ...input,
        },
      );
      return { receipt: { id: receipt.id, path }, ...(warning ? { warning } : {}) };
    } catch (error) {
      return { receipt: null, warning: `no receipt: ${toFail(error).error.message}` };
    }
  };

  const failed = <T>(spec: ActionSpec<T>, error: unknown, made: readonly Decision[]) => {
    // The code and message: a guardrail's details are its decision, in `decisions` already.
    const { code, message } = toFail(error).error;
    write(
      {
        type: spec.type ?? 'action',
        status: code === 'guardrail_blocked' ? 'blocked' : 'failed',
        summary: spec.failure,
        inputs: spec.inputs,
        outputs: { error: { code, message } },
      },
      made,
      spec.argv,
    );
    return error;
  };
  const succeeded = <T>(spec: ActionSpec<T>, result: T, made: readonly Decision[]): Recorded<T> => {
    const own = spec.warning?.(result);
    if (spec.changed && !spec.changed(result)) {
      return { result, receipt: null, ...(own ? { warning: own } : {}) };
    }
    const written = write(
      {
        type: spec.type ?? 'action',
        status: 'ok',
        summary: spec.summary(result),
        project: spec.project?.(result),
        session: spec.session?.(result),
        agent: spec.agent?.(result),
        inputs: spec.inputs,
        outputs: spec.outputs?.(result) ?? {},
      },
      made,
      spec.argv,
    );
    const warning = joinWarnings(own, written.warning);
    return { result, receipt: written.receipt, ...(warning ? { warning } : {}) };
  };

  type Action<T> = (decisions: DecisionRecorder) => T;
  function record<T>(spec: ActionSpec<T>, action: Action<Promise<T>>): Promise<Recorded<T>>;
  function record<T>(spec: ActionSpec<T>, action: Action<T>): Recorded<T>;
  function record<T>(spec: ActionSpec<T>, action: Action<T | Promise<T>>) {
    const made: Decision[] = [];
    let result: T | Promise<T>;
    try {
      result = action({ record: (decision) => void made.push(decision) });
    } catch (error) {
      throw failed(spec, error, made);
    }
    if (!(result instanceof Promise)) return succeeded(spec, result, made);
    return result.then(
      (value) => succeeded(spec, value, made),
      (error) => {
        throw failed(spec, error, made);
      },
    );
  }
  return record;
}
