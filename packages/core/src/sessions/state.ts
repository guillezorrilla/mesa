import { AGENTS } from '../agents/agents.js';
import type { AgentProcess } from '../agents/listing.js';
import type { Agent } from '../agents/names.js';
import { AGENT_STATES } from '../agents/states.js';
import { decide, type FaroDeps } from '../decisions/decide.js';
import { rulesBackend, toAnswer, type Weights } from '../decisions/rules.js';
import type { Decision, Question } from '../decisions/types.js';
import type { SessionRecord } from './record.js';
import { FINAL_STATES, type SessionState, WAITING_STATES } from './states.js';

type LastState = SessionRecord['lastState'];

/** Everything Faro reads about one session to place it on the board. */
export type SessionSignals = {
  /** ISO: when the board looks. */
  now: string;
  agent: Agent;
  background?: boolean;
  /** Where the session was last seen, and since when. */
  last: LastState;
  /** Stopped by Mesa: its last state stands. */
  ended: boolean;
  /** The latest hook event (sessions/events), its payload as logged. */
  event?: { at: string; event: string; payload?: unknown };
  /** The agent listing's row, while it lists the session. */
  listed?: Pick<AgentProcess, 'status' | 'waitingFor'>;
  /** Its tmux window, when Mesa runs it; `exists: false` when the window is gone. */
  window?: { exists: boolean; dead: boolean; deadStatus?: number; deadSignal?: string };
  /** The pane's last lines, read only when no hook or listing speaks. */
  tail?: string;
  /** The project's priority from its mesa.yaml, 0 to 1. */
  priority: number;
};

const FRESH_MS = 60_000;
/** The listing trails a hook by about 0.3 s (the spike): a newer wait does not yield to it. */
const LISTING_LAG_MS = 2_000;
/**
 * ADR-0003's tiers; a hook older than a minute counts for less, until the listing agrees. The
 * listing's own (0.85) is its agent's (`AGENTS[agent].listing.state`).
 */
const HOOK = 0.95;
const STALE_HOOK = 0.8;
/** A dead or vanished window is a process fact (CONTEXT.md, Session state). */
export const PROCESS = 0.85;

/** An exited agent's state: `failed` for a signal or a nonzero status, else `done`. */
export const exitState = (pane: { deadStatus?: number; deadSignal?: string }) =>
  pane.deadSignal || (pane.deadStatus ?? 0) !== 0 ? ('failed' as const) : ('done' as const);
/** The tail is display, not truth: 0.6 at most (ADR-0003 amendment). */
const TAIL = 0.6;

/**
 * Where a session is, by ADR-0003's order: a stopped session keeps its state; a dead or gone
 * window is a process fact (a session already done or failed stays so); then the latest hook
 * event, which yields a wait to a later listing that says the agent moved on (a denial fires no
 * hook); then the listing; then the tail. With no signal at all the last state stands. `at` is
 * when the state began: the hook event's time, else when it was first seen.
 */
export function classify(s: SessionSignals): LastState {
  const seen = (state: SessionState, confidence: number, source: LastState['source']) => ({
    state,
    confidence,
    source,
    at: state === s.last.state ? s.last.at : s.now,
  });
  if (s.ended) return s.last;
  // The agent's own readers say what its hooks, listing, and screen mean.
  const reader = AGENTS[s.agent];
  const fromHook = s.event && reader.hookState?.(s.event.event, s.event.payload);
  const listing = s.listed && reader.listing.state(s.listed);
  if (s.window && (!s.window.exists || s.window.dead) && !listing) {
    // A background pane is only a view, and a failed listing proves nothing about the agent.
    if (s.background) return s.last;
    if (FINAL_STATES.has(s.last.state)) return s.last;
    if (s.event && (fromHook === 'done' || fromHook === 'failed')) {
      return { state: fromHook, confidence: HOOK, source: 'hook', at: s.event.at };
    }
    return seen(s.window.dead ? exitState(s.window) : 'done', PROCESS, 'tmux');
  }
  if (fromHook && s.event) {
    const age = Date.parse(s.now) - Date.parse(s.event.at);
    const movedOn = WAITING_STATES.has(fromHook) ? age > LISTING_LAG_MS : age >= FRESH_MS;
    if (listing && listing.state !== fromHook && movedOn) {
      return seen(listing.state, listing.confidence, 'listing');
    }
    const confidence = age < FRESH_MS || listing?.state === fromHook ? HOOK : STALE_HOOK;
    return { state: fromHook, confidence, source: 'hook', at: s.event.at };
  }
  if (listing) return seen(listing.state, listing.confidence, 'listing');
  const fromTail = s.tail === undefined ? undefined : reader.screen.state(s.tail);
  if (fromTail) return seen(fromTail, TAIL, 'tmux');
  return s.last;
}

// Attention levels, lowest first; a Score's position runs 0 (none) to 1 (urgent).
const LEVELS = ['none', 'low', 'medium', 'high', 'urgent'];

/**
 * How urgently a person is needed, as weights over LEVELS. By state first, so a wait always
 * outranks the rest: a waiting session starts at high (0.75) and climbs to urgent over five
 * minutes and with priority; working stays at or below 0.125. A finished turn (idle) and a
 * failure grow over ten minutes; a stopped session needs nobody.
 */
export function attentionWeights(c: LastState, s: SessionSignals): Record<string, number> {
  if (s.ended) return { none: 1 };
  const seconds = Math.max(0, (Date.parse(s.now) - Date.parse(c.at)) / 1000);
  const p = Math.min(1, Math.max(0, s.priority));
  const grow = (span: number) => Math.min(1, seconds / span);
  switch (c.state) {
    case 'waiting-permission':
    case 'waiting-question':
      return { high: 1, urgent: 3 * grow(300) + p };
    case 'failed':
      return { medium: 1, high: grow(600) + p };
    case 'idle':
      return { low: 1, medium: grow(600) + p };
    case 'done':
      return { low: 1 };
    default:
      return { none: 1, low: p };
  }
}

const ATTENTION: Question = { kind: 'Score', id: 'attention', levels: LEVELS };
const STATE_QUESTIONS: Question[] = [
  { kind: 'Choice', id: 'state', options: [...AGENT_STATES] },
  ATTENTION,
  { kind: 'Noul', id: 'human', statement: 'A human is needed now' },
];

/** The weights the rules give: the classified state at its confidence, the rest shared evenly. */
function weigh(s: SessionSignals): Record<string, Weights> {
  const c = classify(s);
  const rest = (1 - c.confidence) / (AGENT_STATES.length - 1);
  const state = Object.fromEntries(
    AGENT_STATES.map((name) => [name, name === c.state ? c.confidence : rest]),
  );
  const human = AGENT_STATES.filter((n) => WAITING_STATES.has(n)).reduce(
    (sum, n) => sum + (state[n] ?? 0),
    0,
  );
  return { state, attention: attentionWeights(c, s), human };
}

/** The rules backend for session state: one rule, `classify` above. */
const stateRules = rulesBackend<SessionSignals>([{ when: () => true, answer: (_, s) => weigh(s) }]);

/**
 * A board row's place: its state, its attention (0 to 1), and the Decision behind them, which a
 * state Mesa holds (queued, stopped) has none of.
 */
export type Placement = { lastState: LastState; attention: number; decision?: Decision };

/**
 * Faro places one session: a Choice over the six agent states, a Score for attention, and a Noul for
 * "a human is needed now", asked through `decide` of the state rules alone (ADR-0020). Their
 * reading is the state, so a state an older Mesa saved from the adapter yields to the first look
 * that reads anything. Attention comes from the rules' bands, applied to that state.
 */
export async function classifySession(
  deps: Omit<FaroDeps<SessionSignals>, 'backends'>,
  signals: SessionSignals,
): Promise<Required<Placement>> {
  const decision = await decide({ ...deps, backends: [stateRules] }, signals, STATE_QUESTIONS);
  const lastState = classify(signals);
  const attention = toAnswer(ATTENTION, attentionWeights(lastState, signals));
  return { lastState, attention: attention.kind === 'Score' ? attention.answer : 0, decision };
}
