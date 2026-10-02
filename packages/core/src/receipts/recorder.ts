import type { Agent } from '../agents/names.js';
import type { Decision, DecisionRecorder } from '../decisions/types.js';
import type { Clock } from '../lib/clock.js';
import type { IdSource } from '../lib/ids.js';
import { toFail } from '../lib/result.js';
import { acceptsMesaWrites } from '../vault/vault.js';
import { keepFailure, keepSuccess, type RecordKind } from './policy.js';
import { decisionEntries, type ReceiptInput } from './schema.js';
import { writeReceipt } from './store.js';

/** What one action's receipt says, given the action's result. */
type ActionSpec<T> = {
  /** Only a deliberate decision, material guardrail intervention, or actual vault change is knowledge. */
  kind?: RecordKind;
  /** Also record a vault switch in the vault the profile leaves. */
  alsoVault?: string;
  /** `action` unless the work is a session's, a skill run's, or a decision asked for itself. */
  type?: 'action' | 'session' | 'skill' | 'decision';
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
  /** Context known before an action returns, retained when a guardrail blocks it. */
  scope?: { project?: string; session?: string; agent?: Agent; actor?: string };
  /** What the work cost in US dollars, for information (an adapter decision's list price). */
  cost?: (result: T) => number | undefined;
  /** False when the action changed nothing: then no receipt. */
  changed?: (result: T) => boolean;
  /** The action's own warning, joined before its receipt's into the Recorded one. */
  warning?: (result: T) => string | undefined;
};

/** The action's result, its optional knowledge entry, and any operational warning. */
export type Recorded<T> = {
  result: T;
  receipt: { id: string; path: string } | null;
  warning?: string;
};

/** Warnings joined into one, the empty ones dropped; none when every one is. */
export const joinWarnings = (...parts: (string | undefined)[]) =>
  parts.filter(Boolean).join('; ') || undefined;

/**
 * Runs actions, sync or async, and keeps only knowledge selected by the recording policy.
 * Faro decisions made during a kept action land in its receipt. A required receipt never fails
 * the action it records: a write failure becomes a warning.
 */
export function actionRecorder(deps: {
  profile: string;
  /** The vault path, or undefined when the profile has none yet. */
  vault: () => string | undefined;
  clock: Clock;
  newId: IdSource;
  /** The redacted command line of `argv`, else of this invocation. */
  command: (argv?: readonly string[]) => string;
  /** Whole receipt labels, including question ids and probability-map keys. */
  redact: (text: string) => string;
}) {
  // Everything here is guarded: a receipt problem never escapes into the action's outcome.
  const write = (
    input: Omit<ReceiptInput, 'profile' | 'command' | 'decisions'>,
    made: readonly Decision[],
    argv?: readonly string[],
    vaultOverride?: string,
  ): Omit<Recorded<unknown>, 'result'> => {
    try {
      const vault = vaultOverride ?? deps.vault();
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
          decisions: made.flatMap((decision) => decisionEntries(decision, deps.redact)),
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
    if (!keepFailure(spec.kind, code)) return error;
    write(
      {
        type: spec.type ?? 'action',
        kind: spec.kind,
        ...spec.scope,
        status: code === 'guardrail_blocked' ? 'blocked' : 'failed',
        summary: spec.failure,
        inputs: spec.inputs,
        outputs: { error: { code, message: deps.redact(message) } },
      },
      made,
      spec.argv,
    );
    return error;
  };
  const succeeded = <T>(spec: ActionSpec<T>, result: T, made: readonly Decision[]): Recorded<T> => {
    const own = spec.warning?.(result);
    if (!spec.kind || (spec.changed && !spec.changed(result))) {
      return { result, receipt: null, ...(own ? { warning: own } : {}) };
    }
    const outputs = spec.outputs?.(result) ?? {};
    if (!keepSuccess(spec.kind, outputs)) {
      return { result, receipt: null, ...(own ? { warning: own } : {}) };
    }
    const input: Omit<ReceiptInput, 'profile' | 'command' | 'decisions'> = {
      type: spec.type ?? 'action',
      kind: spec.kind,
      status: 'ok',
      summary: spec.summary(result),
      project: spec.project?.(result) ?? spec.scope?.project,
      session: spec.session?.(result) ?? spec.scope?.session,
      agent: spec.agent?.(result) ?? spec.scope?.agent,
      actor: spec.scope?.actor,
      cost: spec.cost?.(result),
      inputs: spec.inputs,
      outputs,
    };
    const written = write(input, made, spec.argv);
    const departure = spec.alsoVault ? write(input, made, spec.argv, spec.alsoVault) : undefined;
    const warning = joinWarnings(own, written.warning, departure?.warning);
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
