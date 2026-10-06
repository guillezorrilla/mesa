import type { Faro } from '../../decisions/faro.js';
import type { Guarded, Override, Overrides } from '../../decisions/guardrail.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import { redactText } from '../../lib/redact.js';
import { joinWarnings } from '../../receipts/recorder.js';
import type { Caller } from '../caller.js';
import { recordStart, startedOutputs } from '../session-receipt.js';
import type { StopOutcome } from '../stop.js';
import { awaitRun, endRun, type RunEnd } from './end.js';
import { type RunInput, startRun } from './start.js';

// A skill run headlessly (CONTEXT.md, Skill run): a session of kind run, started through the one
// launch sequence (start.ts), whose agent prints its result into the profile's runs/ and its
// errors on its pane (and so in its output log), then exits (files.ts). Whoever sees the exit
// first, the wait in `mesa run` or tmux's pane-died hook, ends it the same way (endRun, end.ts):
// its record and where its output lands (land.ts).

/**
 * Runs a skill headlessly on a project (CONTEXT.md, Skill run), or about a session, whose
 * output log its agent reads, once the guardrail lets its prompt through (`yes`, `force`,
 * and a person's `confirm` past an ask or a block), and waits up to `timeoutSeconds` for
 * its result, which is returned, ok or not, with the vault note its output became, if any.
 * A blocked or overridden guardrail keeps its decision; a changed vault note keeps a
 * separate receipt. Its end, as a stop does, starts what was queued after it.
 */
export async function runSkill(
  ctx: Parameters<typeof awaitRun>[0],
  deps: {
    faro: Pick<Faro, 'guardrail'>;
    /** Who runs this mesa: the window's session is the run's parent. */
    caller: () => Caller;
    /** What the run's start takes, with its prompt's guardrail (startRun). */
    start: (
      skill: string,
      guard: (action: Guarded) => Promise<Override | undefined>,
    ) => Parameters<typeof startRun>[0];
    /** A stop's signal: what was queued after the run starts once it has ended (endSignals). */
    stopped: (id: string, outcome: StopOutcome) => Promise<{ warning?: string } | undefined>;
  },
  skill: string,
  opts: Omit<RunInput, 'skill'> & Overrides,
) {
  const { store, secrets, open } = ctx;
  const { force, yes, confirm, ...input } = opts;
  const { project, session, agent, args = [] } = input;
  const on = project ? ` on ${project}` : session ? ` about session ${session}` : '';
  const about = session ? store.find(session) : undefined;
  const started = await recordStart(
    ctx,
    (r) => r.record,
    {
      type: 'skill',
      scope: {
        project: project ?? about?.project,
        session: about?.id,
        actor: deps.caller().session?.id,
      },
      summary: ({ record: r }) =>
        `Started skill ${skill} on ${r.project}${r.about ? ` about session ${r.about}` : ''} as session ${r.id}`,
      failure: `Could not run skill ${skill}${on}`,
      inputs: {
        skill,
        ...(project === undefined ? {} : { project }),
        ...(session === undefined ? {} : { session }),
        agent: agent ?? null,
        args: args.map((a) => redactText(a, secrets())),
        ...(force ? { force } : {}),
        ...(yes ? { yes } : {}),
      },
      outputs: ({ record: r, override }) => ({
        ...startedOutputs(r, open().config.agents),
        ...(override ? { override } : {}),
      }),
    },
    // Typed, so the result type comes from the action, as for one that takes nothing.
    (decisions: DecisionRecorder) => {
      const guard = (action: Guarded) =>
        deps.faro.guardrail.gate(action, { force, yes, confirm }, decisions);
      return startRun(deps.start(skill, guard), { ...input, skill });
    },
  );
  const run = store.get(started.result.record.id);
  // A fast hook may finish before record() writes a guardrail override receipt. Complete
  // the run from its persisted record without depending on another tmux look.
  let finished: RunEnd;
  let queue: Awaited<ReturnType<typeof deps.stopped>>;
  try {
    finished = run.endedAt
      ? await endRun(ctx, run)
      : await awaitRun(ctx, run, input.timeoutSeconds);
  } finally {
    // A timeout commits the failed end before throwing; its queue must still start.
    if (store.find(run.id)?.endedAt) queue = await deps.stopped(run.id, 'exited');
  }
  const { result, receipt: landedReceipt, warning: ended } = finished;
  const warning = joinWarnings(started.warning, ended, queue?.warning);
  const { override } = started.result;
  return {
    result: { session: run.id, ...result, ...(override ? { override } : {}) },
    receipt: landedReceipt ?? started.receipt,
    ...(warning ? { warning } : {}),
  };
}
