import type { MesaContext } from '../context.js';
import { MesaError } from '../lib/result.js';
import type { Recorded } from '../receipts/recorder.js';
import { projectLabel } from '../sessions/record/general.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { Stdio } from '../vault/mount/mcp-server.js';
import {
  ASSIST_MODES,
  type AssistMode,
  DEADLINE_MS,
  type Evaluation,
  evaluate,
  NO_MODEL,
} from './evaluate.js';
import type { Faro } from './faro.js';
import { PACKET_CHARS, type Packet } from './packet.js';
import { answerRequest, type DecisionAnswer, decisionRequest, REQUEST_SITES } from './request.js';
import { decisionBinding } from './scope.js';
import { DECISION_TOOLS, serveDecisions } from './server.js';
import { sessionDecisions } from './session-decisions.js';
import { ACCEPT_AT, PASSED_GATE } from './sites.js';
import type { Decision, Question } from './types.js';

// Decision assistance for sessions (ADR-0019, CONTEXT.md Decision assistance): scoped context and
// advice for one live session, through `mesa decisions evaluate|context|advise`, the
// decision_evaluate tool, and the app's session details. Routine calls keep nothing but the
// session's bounded use; only an explicit decision with a rationale writes a receipt.

/** How a site runs for a session: off, on demand only (experimental), or automatic. */
export type SiteMode = 'off' | 'on-demand' | 'automatic';

export type EvaluateOptions = {
  /** The session, for a person outside a Mesa window; inside one, only its own. */
  session?: string;
  mode?: AssistMode;
  signal?: AbortSignal;
  /** Keep this one as a decision receipt, with why it matters. */
  rationale?: string;
};

export function decisionAssistance(ctx: MesaContext, faro: Pick<Faro, 'ask' | 'decide'>) {
  const model = () => ctx.configIfAny()?.decisions.model ?? 'none';
  const stateOf = (id: string) => sessionDecisions({ ...ctx, dir: ctx.paths.decisions }, id);
  /** The live session a call serves, or a usage error saying why none. */
  const bound = (given?: string): SessionRecord => {
    const binding = decisionBinding(ctx, given);
    if ('refused' in binding) throw new MesaError('usage', binding.refused);
    return binding.session;
  };
  /** Whether the person turned assistance off for this session. */
  const turnedOff = (session: SessionRecord) => stateOf(session.id).read().off === true;
  /** Why `session` gets no advice now, or undefined. */
  const off = (session: SessionRecord) =>
    model() === 'none'
      ? NO_MODEL
      : turnedOff(session)
        ? `decision assistance is off for session ${session.id}`
        : undefined;

  /** Answers a request for a session: ephemeral, or kept as one decision receipt. */
  const answer = async (
    session: SessionRecord,
    raw: unknown,
    { mode = 'on-demand', signal, rationale }: Omit<EvaluateOptions, 'session'> = {},
  ): Promise<DecisionAnswer & { receipt?: Recorded<Decision>['receipt'] }> => {
    const request = decisionRequest(raw);
    if (rationale !== undefined && mode !== 'on-demand')
      throw new MesaError('usage', 'only an on-demand decision is kept');
    const active = model();
    const disabled = active !== 'none' && turnedOff(session);
    const memory = stateOf(session.id).memory;
    let receipt: Recorded<Decision>['receipt'] | undefined;
    const ask = async (state: string, questions: Question[], deadlineMs: number) => {
      if (rationale === undefined) return faro.ask(state, questions, deadlineMs);
      const recorded = await faro.decide(state, questions, { session: session.id, rationale });
      receipt = recorded.receipt;
      return recorded.result;
    };
    const run = async (packet: Packet, revision?: string): Promise<Evaluation> =>
      disabled
        ? {
            site: packet.site,
            mode,
            status: 'unavailable',
            reason: off(session) ?? '',
            latencyMs: 0,
          }
        : evaluate(
            {
              model: active,
              passed: active === 'none' ? [] : PASSED_GATE[active],
              ask,
              clock: ctx.clock,
              // A kept decision is asked anew, so its receipt holds a real answer.
              memory: rationale === undefined ? memory : { ...memory, ready: () => undefined },
            },
            packet,
            { mode, ...(signal ? { signal } : {}), ...(revision ? { revision } : {}) },
          );
    const answered = await answerRequest(
      { vault: ctx.vaultOf(), store: ctx.store },
      session,
      request,
      run,
      mode,
    );
    return receipt === undefined ? answered : { ...answered, receipt };
  };

  return {
    /** A decision request answered for the session (DecisionRequestSchema). */
    evaluate: async (raw: unknown, { session, ...options }: EvaluateOptions = {}) =>
      answer(bound(session), raw, options),
    /** What the session's details show: each site's mode, the deadlines, and recent use. */
    status: (given?: string) => {
      const session = bound(given);
      const active = model();
      const state = stateOf(session.id).read();
      const passed = active === 'none' ? [] : PASSED_GATE[active];
      return {
        session: session.id,
        project: projectLabel(session.project),
        model: active,
        off: state.off === true,
        sites: REQUEST_SITES.map((site) => ({
          site,
          mode: (active === 'none' || state.off
            ? 'off'
            : passed.includes(site)
              ? 'automatic'
              : 'on-demand') satisfies SiteMode as SiteMode,
          ...(active === 'none' ? {} : { acceptAt: ACCEPT_AT[active][site] }),
        })),
        deadlines: Object.fromEntries(
          ASSIST_MODES.map((m) => [m, DEADLINE_MS[m]]),
        ) as typeof DEADLINE_MS,
        packetChars: PACKET_CHARS,
        ready: state.ready.length,
        use: [...state.use].reverse(),
      };
    },
    /** Turns assistance off for a session, or back on. */
    setOff: (off: boolean, given?: string) => {
      const session = bound(given);
      return { session: session.id, off, changed: stateOf(session.id).setOff(off) };
    },
    /** The decision tools a ready server lists. */
    tools: () => DECISION_TOOLS,
    /** Serves decision_evaluate on `io` until its input ends, to this process's session. */
    mcp: (io: Stdio, version: string) =>
      serveDecisions(io, version, {
        bind: () => decisionBinding(ctx),
        off,
        answer: (session, args, signal) => answer(session, args, { signal }),
      }),
  };
}

export type DecisionAssistance = ReturnType<typeof decisionAssistance>;

export type DecisionStatus = ReturnType<DecisionAssistance['status']>;
