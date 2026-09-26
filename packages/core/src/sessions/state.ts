// Tail patterns ported from CCManager's Claude Code state detector
// (src/services/stateDetector/claude.ts at 7b55c65, https://github.com/kbwo/ccmanager, MIT,
// Copyright (c) kbwo), as ADR-0005 requires. Ported: the search prompt (idle), the ctrl+r
// toggle (no reading), the "Do you want / Would you like" menu, "esc to cancel", the numbered
// "Deny (esc)" option, and, in the most recent block above the prompt box only, "esc to
// interrupt", "ctrl+c to interrupt", the spinner activity label, and the token stats line.
// Changed here: CCManager's single `waiting_input` splits into a question (the menu's "Enter to
// select", Mesa's marker from docs/spikes/state-signals.md, checked first) and a permission; the
// "Do you want" menu must offer a numbered Yes, so a plain question above the prompt stays idle;
// and there is no idle debounce, since the board reads one snapshot (at 0.6, only when no hook
// or listing speaks). Codex patterns land in #43.

import { createHash } from 'node:crypto';
import type { Agent } from '../agents/agents.js';
import { decide, type FaroDeps } from '../decisions/decide.js';
import { rulesBackend, toAnswer, type Weights } from '../decisions/rules.js';
import type { Backend, Decision, Question } from '../decisions/types.js';
import type { AgentProcess } from './agent-listing.js';
import {
  FINAL_STATES,
  SESSION_STATES,
  type SessionRecord,
  type SessionState,
  WAITING_STATES,
} from './record.js';

type LastState = SessionRecord['lastState'];

/** Everything Faro reads about one session to place it on the board. */
export type SessionSignals = {
  /** ISO: when the board looks. */
  now: string;
  agent: Agent;
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
 * listing's own (0.85) is `listedState`'s.
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

const field = (payload: unknown, key: string) =>
  payload && typeof payload === 'object' && key in payload
    ? String((payload as Record<string, unknown>)[key])
    : undefined;

/** The state a hook event means (docs/spikes/state-signals.md), or none for one that says nothing. */
export function hookState(event: string, payload?: unknown): SessionState | undefined {
  const question = field(payload, 'tool_name') === 'AskUserQuestion';
  switch (event) {
    case 'SessionStart':
    case 'Stop':
      return 'idle';
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return 'working';
    case 'PermissionRequest':
      return question ? 'waiting-question' : 'waiting-permission';
    case 'PreToolUse':
      return question ? 'waiting-question' : undefined;
    case 'Notification':
      return field(payload, 'notification_type') === 'idle_prompt' ? 'idle' : undefined;
    case 'SessionEnd':
      return 'done';
    case 'StopFailure':
      return 'failed';
    default:
      return undefined;
  }
}

// CCManager's markers (see the header).
const SPINNER_CHARS = '✱✲✳✴✵✶✷✸✹✺✻✼✽✾✿❀❁❂❃❇❈❉❊❋✢✣✤✥✦✧✨⊛⊕⊙◉◎◍⁂⁕※⍟☼★☆·•⏺▸▹∙⋅○●';
const SPINNER_ACTIVITY = new RegExp(`^[${SPINNER_CHARS}] \\S+ing.*\u2026`, 'm');
const TOKEN_STATS = /\([^)]*\d[^)]*tokens\s*\)/i;
const RULE = /^[-─\s]*$/;

/**
 * CCManager's getRecentContentAbovePromptBox: the lines above the prompt box (the second ─
 * border from the bottom), trailing blanks, rules, and the bare ❯ dropped, then the last
 * contiguous block of them. Old output further up cannot read as busy.
 */
function recentAbovePrompt(tail: string): string {
  const lines = tail.split('\n');
  const borders = lines.flatMap((l, i) => (/^─+$/.test(l.trim()) ? [i] : []));
  const above = lines.slice(0, borders.length >= 2 ? borders.at(-2) : lines.length);
  while (above.length && (RULE.test(above.at(-1) ?? '') || above.at(-1)?.trim() === '❯')) {
    above.pop();
  }
  let start = above.length;
  while (start > 0 && !RULE.test(above[start - 1] ?? '')) start--;
  return above.slice(start).join('\n');
}

// ponytail: 200 characters, as the hook log keeps; the board shows one line.
/** The board's "last output": the last line of the latest block above the prompt box. */
export function lastOutputLine(tail: string): string | undefined {
  const line = recentAbovePrompt(tail)
    .split('\n')
    .map((l) => l.trim())
    // tmux's own line under a dead pane (remain-on-exit) is not the agent's.
    .filter((l) => l && !/^Pane is dead \(/.test(l))
    .at(-1);
  return line && Array.from(line).slice(0, 200).join('');
}

/** Claude Code's screen read as a state, or none when it shows nothing that says one. */
function tailState(agent: Agent, tail: string): SessionState | undefined {
  if (agent !== 'claude' || !tail.trim()) return undefined;
  const lower = tail.toLowerCase();
  if (lower.includes('⌕ search…')) return 'idle';
  if (lower.includes('ctrl+r to toggle')) return undefined;
  // The question menu: "Enter to select · ↑/↓ to navigate · Esc to cancel".
  if (lower.includes('enter to select')) return 'waiting-question';
  if (/(?:do you want|would you like).+\n+[\s\S]*?\d+\.\s*yes/.test(lower)) {
    return 'waiting-permission';
  }
  if (lower.includes('esc to cancel') || /\d+\.\s*deny\s*\(esc\)/.test(lower)) {
    return 'waiting-permission';
  }
  const recent = recentAbovePrompt(tail);
  const busy = recent.toLowerCase();
  if (busy.includes('esc to interrupt') || busy.includes('ctrl+c to interrupt')) return 'working';
  if (SPINNER_ACTIVITY.test(recent) || TOKEN_STATS.test(recent)) return 'working';
  return 'idle';
}

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
  const fromHook = s.event && hookState(s.event.event, s.event.payload);
  const listing = s.listed && listedState(s.listed);
  if (s.window && (!s.window.exists || s.window.dead) && !listing) {
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
  const fromTail = s.tail === undefined ? undefined : tailState(s.agent, s.tail);
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
  { kind: 'Choice', id: 'state', options: [...SESSION_STATES] },
  ATTENTION,
  { kind: 'Noul', id: 'human', statement: 'A human is needed now' },
];

/** The weights the rules give: the classified state at its confidence, the rest shared evenly. */
function weigh(s: SessionSignals): Record<string, Weights> {
  const c = classify(s);
  const rest = (1 - c.confidence) / (SESSION_STATES.length - 1);
  const state = Object.fromEntries(
    SESSION_STATES.map((name) => [name, name === c.state ? c.confidence : rest]),
  );
  const human = SESSION_STATES.filter((n) => WAITING_STATES.has(n)).reduce(
    (sum, n) => sum + (state[n] ?? 0),
    0,
  );
  return { state, attention: attentionWeights(c, s), human };
}

/** The rules backend for session state: one rule, `classify` above. */
const stateRules = rulesBackend<SessionSignals>([{ when: () => true, answer: (_, s) => weigh(s) }]);

/** A board row's place: its state, its attention (0 to 1), and the Decision behind them. */
export type Placement = { lastState: LastState; attention: number; decision: Decision };

/** What the adapter saw, as a short hash: while it is unchanged, the adapter's answer stands. */
const basisOf = (s: SessionSignals) =>
  createHash('sha256')
    .update(JSON.stringify([s.agent, s.ended, s.event, s.listed, s.window, s.tail]))
    .digest('hex')
    .slice(0, 16);

/**
 * Faro places one session: a Choice over the six states, a Score for attention, and a Noul for
 * "a human is needed now", asked through `decide` with the state rules first and `backends`
 * (the adapter) when they are unsure. The adapter's Choice, when it answered, is the state, kept
 * with the `basis` it saw: the board refreshes every few seconds, and while nothing it saw has
 * changed the adapter is not asked again. Attention always comes from the rules' bands, applied
 * to the state that stands, so a wait outranks work whoever named the state.
 */
export async function classifySession(
  deps: Omit<FaroDeps<SessionSignals>, 'backends'> & {
    backends?: readonly Backend<SessionSignals>[];
  },
  signals: SessionSignals,
): Promise<Placement> {
  const basis = basisOf(signals);
  const known = signals.last.source === 'adapter' && signals.last.basis === basis;
  const backends = [stateRules, ...(known ? [] : (deps.backends ?? []))];
  const decision = await decide({ ...deps, backends }, signals, STATE_QUESTIONS);
  const [state] = decision.answers;
  const adapted = decision.backend === 'adapter' && state?.kind === 'Choice' ? state : undefined;
  const lastState: LastState = known
    ? signals.last
    : adapted
      ? {
          state: adapted.answer as SessionState,
          confidence: adapted.confidence,
          source: 'adapter',
          at: adapted.answer === signals.last.state ? signals.last.at : signals.now,
          basis,
        }
      : classify(signals);
  const attention = toAnswer(ATTENTION, attentionWeights(lastState, signals));
  return { lastState, attention: attention.kind === 'Score' ? attention.answer : 0, decision };
}

/** What each listed status means as a session state (docs/spikes/state-signals.md). */
const LISTED: Record<string, SessionState> = {
  idle: 'idle',
  busy: 'working',
  'waiting:permission prompt': 'waiting-permission',
  'waiting:input needed': 'waiting-question',
};

/**
 * The state the listing alone gives, at ADR-0003's 0.85. A wait it cannot name still needs a
 * person (0.6); a status it has never shown is a guess at `working` (0.5).
 */
export function listedState(p: Pick<AgentProcess, 'status' | 'waitingFor'>): {
  state: SessionState;
  confidence: number;
} {
  const state = LISTED[p.waitingFor ? `${p.status}:${p.waitingFor}` : p.status];
  if (state) return { state, confidence: 0.85 };
  return p.status === 'waiting'
    ? { state: 'waiting-question', confidence: 0.6 }
    : { state: 'working', confidence: 0.5 };
}
