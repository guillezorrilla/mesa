import type { MesaContext } from '../context.js';
import { clip } from '../lib/clip.js';
import { MesaError } from '../lib/result.js';
import type { Recorded } from '../receipts/recorder.js';
import { projectLabel } from '../sessions/record/general.js';
import type { SessionRecord } from '../sessions/record/record.js';
import type { Stdio } from '../vault/mount/mcp-server.js';
import { turnAdvice } from './delivery.js';
import {
  ASSIST_MODES,
  type AssistMode,
  DEADLINE_MS,
  type EvaluateDeps,
  type Evaluation,
  evaluate,
  NO_MODEL,
} from './evaluate.js';
import type { Faro } from './faro.js';
import { siteMeasure } from './measured.js';
import { PER_TURN_MS } from './models.js';
import { PACKET_CHARS, type Packet } from './packet.js';
import { answerRequest, type DecisionAnswer, decisionRequest, REQUEST_SITES } from './request.js';
import { decisionBinding } from './scope.js';
import { DECISION_TOOLS, serveDecisions } from './server.js';
import { sessionDecisions } from './session-decisions.js';
import { siteMode } from './site-mode.js';
import { ACCEPT_AT } from './sites.js';
import type { Decision } from './types.js';

// Decision assistance for sessions (ADR-0019, CONTEXT.md Decision assistance): scoped context and
// advice for one live session, through `mesa decisions evaluate|context|advise`, the
// decision_evaluate tool, and the app's session details. Routine calls keep nothing but the
// session's bounded use; only an explicit decision with a rationale writes a receipt.

export type EvaluateOptions = {
  /** The session, for a person outside a Mesa window; inside one, only its own. */
  session?: string;
  mode?: AssistMode;
  signal?: AbortSignal;
  /** Only an answer made before (evaluate's readyOnly). */
  readyOnly?: boolean;
  /** The clock time (ms) the whole call ends by: a model is asked only for what is left of it. */
  until?: number;
  /** Keep this one as a decision receipt, with why it matters. */
  rationale?: string;
};

export function decisionAssistance(ctx: MesaContext, faro: Pick<Faro, 'ask' | 'decide'>) {
  const model = () => ctx.configIfAny()?.decisions.model ?? 'none';
  /** The person's opt-in to automatic decisions where the model is not proven yet. */
  const experimental = () => ctx.configIfAny()?.decisions.experimental ?? false;
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
    {
      mode = 'on-demand',
      signal,
      rationale,
      readyOnly,
      until,
    }: Omit<EvaluateOptions, 'session'> = {},
  ): Promise<DecisionAnswer & { receipt?: Recorded<Decision>['receipt'] }> => {
    const request = decisionRequest(raw);
    if (rationale !== undefined && mode !== 'on-demand')
      throw new MesaError('usage', 'only an on-demand decision is kept');
    const active = model();
    const disabled = active !== 'none' && turnedOff(session);
    const memory = stateOf(session.id).memory;
    let receipt: Recorded<Decision>['receipt'] | undefined;
    const ask: EvaluateDeps['ask'] = async (state, questions, full, options) => {
      // What the call's budget leaves after reading the vault and the ready answers.
      const deadlineMs =
        until === undefined ? full : Math.max(0, Math.min(full, until - ctx.clock().getTime()));
      if (rationale === undefined) return faro.ask(state, questions, deadlineMs, options);
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
              experimental: experimental(),
              ask,
              clock: ctx.clock,
              // A kept decision is asked anew, so its receipt holds a real answer.
              memory: rationale === undefined ? memory : { ...memory, ready: () => undefined },
            },
            packet,
            {
              mode,
              ...(signal ? { signal } : {}),
              ...(revision ? { revision } : {}),
              ...(readyOnly ? { readyOnly } : {}),
            },
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

  /**
   * Automatic advice for `session`, a live record its own hook already checked (ADR-0019): the
   * scoped context of `query` (else its saved goal) at the relevance site, all within the per-turn
   * deadline (PER_TURN_MS, ADR-0019: the ready read and any live ask together, the ask getting
   * only what is left), or only a ready answer; the words to send, or nothing (off, no model, a
   * miss, an abstention, a late or failed call). What is sent is noted as observed.
   */
  const advise = async (
    session: SessionRecord,
    query: string | undefined,
    { readyOnly }: { readyOnly?: boolean } = {},
  ): Promise<string | undefined> => {
    // The budget counts from the hook process's own start when the entrypoint gives it.
    const until = (ctx.processStartedAt ?? ctx.clock()).getTime() + PER_TURN_MS;
    const signal = AbortSignal.timeout(Math.max(0, until - ctx.clock().getTime()));
    const asked = query?.trim() || session.goal?.trim();
    if (!asked || off(session)) return undefined;
    const context = await answer(
      session,
      { site: 'relevance', query: clip(asked, 500) },
      { mode: 'automatic', signal, until, readyOnly },
    );
    const text = 'sources' in context ? turnAdvice(context) : undefined;
    if (text) stateOf(session.id).saw('advice');
    return text;
  };

  return {
    /** A decision request answered for the session (DecisionRequestSchema). */
    evaluate: async (raw: unknown, { session, ...options }: EvaluateOptions = {}) =>
      answer(bound(session), raw, options),
    advise,
    /**
     * The saved goal's answer, asked as its agent starts (`mesa decisions prepare`, which the
     * window runs before it): the evaluation, kept as a ready answer for the first turn.
     */
    prepare: async (given?: string) => {
      const session = bound(given);
      const why = off(session);
      if (why || !session.goal?.trim())
        return { session: session.id, prepared: false, reason: why ?? 'no saved goal' };
      const context = await answer(session, { site: 'relevance' }, { mode: 'automatic' });
      return {
        session: session.id,
        prepared: context.evaluation.status !== 'unavailable',
        evaluation: context.evaluation,
      };
    },
    /** What the session's delivery status reads: the model, whether it is off, and what was seen. */
    assistState: (session: SessionRecord) => {
      const state = stateOf(session.id).read();
      return {
        model: model(),
        experimental: experimental(),
        off: state.off === true,
        seen: state.seen ?? {},
      };
    },
    /** What the session's details show: each site's mode, the deadlines, and recent use. */
    status: (given?: string) => {
      const session = bound(given);
      const active = model();
      const state = stateOf(session.id).read();
      const opted = experimental();
      return {
        session: session.id,
        project: projectLabel(session.project),
        model: active,
        off: state.off === true,
        sites: REQUEST_SITES.map((site) => {
          // Turned off for this session, every site is off.
          const { mode, experimental } = state.off
            ? { mode: 'off' as const, experimental: false }
            : siteMode(active, site, opted);
          return {
            site,
            mode,
            ...(active === 'none' ? {} : { acceptAt: ACCEPT_AT[active][site] }),
            ...(experimental ? { experimental: true as const } : {}),
            ...(active === 'none' ? {} : { measured: siteMeasure(active, site) }),
          };
        }),
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
        answer: async (session, args, signal) => {
          const answered = await answer(session, args, { signal });
          stateOf(session.id).saw('tool');
          return answered;
        },
      }),
  };
}

export type DecisionAssistance = ReturnType<typeof decisionAssistance>;

export type DecisionStatus = ReturnType<DecisionAssistance['status']>;
