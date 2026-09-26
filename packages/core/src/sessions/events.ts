import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, type Agent, AgentSchema } from '../agents.js';
import type { Clock } from '../clock.js';
import { redactText } from '../receipts.js';
import { MesaError } from '../result.js';
import { isSessionId, type SessionRecord, type SessionStore } from './store.js';
import type { TmuxWindow, WindowTarget } from './tmux.js';

// One line per agent hook in `sessions/events/<mesa-session-id>.jsonl`: the first signal Faro
// reads for session state (ADR-0003).

const SECRET_KEY = /token|key|secret|password/i;

export type HookEvent = {
  at: string;
  agent: Agent;
  event: string;
  agentSessionId?: string;
  payload: unknown;
};

// ponytail: 200 characters of any one string (a prompt, a tool's output); the log is for state,
// not for content, and grows by one line per hook.
const MAX_STRING = 200;
const literal = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Values under a key naming a secret become `***`, as do configured key values; the home
 * directory becomes `~` (also in the escaped form Claude uses in project folder names); strings
 * longer than `maxString` are cut. The one redactor for hook logs and for what Faro's adapter
 * sends.
 */
export function redactPayload(
  value: unknown,
  home: string,
  secrets: readonly string[] = [],
  maxString = MAX_STRING,
): unknown {
  const homes = home
    ? new RegExp(`${literal(home)}(?=/|$)|${literal(home.replaceAll('/', '-'))}(?=-|$)`, 'g')
    : undefined;
  const walk = (v: unknown): unknown => {
    if (typeof v === 'string') {
      const text = redactText(homes ? v.replace(homes, '~') : v, secrets);
      return text.length > maxString ? `${text.slice(0, maxString)}...` : text;
    }
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === 'object') {
      return Object.fromEntries(
        Object.entries(v).map(([k, x]) => [k, SECRET_KEY.test(k) ? '***' : walk(x)]),
      );
    }
    return v;
  };
  return walk(value);
}

/**
 * Appends one hook payload to its session's event log, and gives the record its agent session id
 * when that is first learned. Undefined, and nothing written, when the hook did not come from a
 * Mesa session: no MESA_SESSION_ID, or one that is not a session id.
 */
export function recordHookEvent(
  deps: {
    store: SessionStore;
    eventsDir: string;
    clock: Clock;
    home: string;
    secrets: readonly string[];
  },
  input: { agent: string; mesaSessionId?: string; payload: string },
): HookEvent | undefined {
  const agent = AgentSchema.safeParse(input.agent);
  if (!agent.success || !('start' in AGENTS[agent.data])) {
    throw new MesaError('agent_unavailable', `no hooks for agent ${input.agent}; v1 runs claude`);
  }
  const id = input.mesaSessionId;
  if (!id || !isSessionId(id)) return undefined;
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(input.payload);
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    // A payload that is not JSON still marks that the hook fired.
  }
  const agentSessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
  const line: HookEvent = {
    at: deps.clock().toISOString(),
    agent: agent.data,
    event: typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'unknown',
    ...(agentSessionId ? { agentSessionId } : {}),
    payload: redactPayload(payload, deps.home, deps.secrets),
  };
  const record = findRecord(deps.store, id);
  // A claude started inside the session's claude inherits MESA_SESSION_ID; its events are not ours.
  if (record?.agentSessionId && agentSessionId && agentSessionId !== record.agentSessionId) {
    return undefined;
  }
  mkdirSync(deps.eventsDir, { recursive: true, mode: 0o700 });
  appendFileSync(join(deps.eventsDir, `${id}.jsonl`), `${JSON.stringify(line)}\n`);
  // Open and resume set agentSessionId first, so this runs only for a record written without
  // one. ponytail: under the record's lock, which can hold a hook up to 2 s past its budget when
  // another process has the record; it only ever waits on that rare first fill.
  if (record && !record.agentSessionId && agentSessionId) deps.store.update(id, { agentSessionId });
  return line;
}

/**
 * The record, or undefined for a session without one (removed, or another profile's). Unlike
 * `store.find`, any error gives undefined: a hook still logs its event when the record cannot
 * be read.
 */
function findRecord(store: SessionStore, id: string) {
  try {
    return store.get(id);
  } catch {
    return undefined;
  }
}

// ponytail: reads the whole log; read its tail instead if long sessions make it slow.
/** The session's hook events, oldest first; a line that does not parse is skipped. */
export function readHookEvents(eventsDir: string, id: string): HookEvent[] {
  if (!isSessionId(id)) return [];
  const file = join(eventsDir, `${id}.jsonl`);
  if (!existsSync(file)) return [];
  return readFileSync(file, 'utf8')
    .split('\n')
    .flatMap((line) => {
      try {
        const e = JSON.parse(line);
        return typeof e?.event === 'string' && typeof e.at === 'string' ? [e as HookEvent] : [];
      } catch {
        return [];
      }
    });
}

/**
 * tmux's pane-died hook, through `mesa hook tmux pane-died <session> <window>`: the agent in a
 * Mesa window exited, so its session ends now, `done` for exit status 0 and `failed` for another
 * status or a signal (as the board reads a dead pane), with an `ended` event. A window that is
 * no session of this profile's, or a session already ended, is left alone: undefined.
 */
export async function recordPaneDied(
  deps: {
    store: SessionStore;
    tmux: {
      findWindow: (
        target: WindowTarget,
      ) => Promise<Pick<TmuxWindow, 'deadStatus' | 'deadSignal'> | undefined>;
    };
    clock: Clock;
  },
  session: string,
  window: string,
): Promise<SessionRecord | undefined> {
  const id = /^[a-z]+-([0-9a-z]{8})$/.exec(window)?.[1];
  const found = id ? deps.store.find(id) : undefined;
  if (!found || found.endedAt || found.tmux.session !== session || found.tmux.window !== window) {
    return undefined;
  }
  const pane = await deps.tmux.findWindow({ project: session, window });
  const failed = Boolean(pane?.deadSignal) || (pane?.deadStatus ?? 0) !== 0;
  const at = deps.clock().toISOString();
  const state = failed ? 'failed' : 'done';
  const ended = deps.store.update(found.id, (current) =>
    current.endedAt
      ? {}
      : {
          endedAt: at,
          lastState: { state, confidence: 1, at, source: 'tmux-hook' },
          events: [...current.events, { type: 'ended', at }],
        },
  );
  // A stop that got there first already ended it.
  return ended.endedAt === at && ended.lastState.source === 'tmux-hook' ? ended : undefined;
}
