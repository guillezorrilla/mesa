import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { AGENTS, AgentSchema } from '../agents/agents.js';
import type { Agent } from '../agents/names.js';
import type { Clock } from '../lib/clock.js';
import { redactPayload } from '../lib/redact.js';
import { MesaError } from '../lib/result.js';
import { agentSessionHolder } from './holders.js';
import { isSessionId } from './record.js';
import type { SessionStore } from './store.js';

// One line per agent hook in `sessions/events/<mesa-session-id>.jsonl`: the first signal Faro
// reads for session state (ADR-0003).

export type HookEvent = {
  at: string;
  agent: Agent;
  event: string;
  agentSessionId?: string;
  /** The record selected by the hook, also used by end-of-session effects. */
  mesaSessionId?: string;
  payload: unknown;
};

/** Claude marks hooks fired inside a subagent with agent_id; they are not parent state signals. */
export const parentHook = (event: HookEvent) =>
  !event.payload || typeof event.payload !== 'object' || !('agent_id' in event.payload);

/** A session's hook events log: `<events>/<Mesa session id>.jsonl`. */
export const eventsLog = (eventsDir: string, id: string) => join(eventsDir, `${id}.jsonl`);

/**
 * Appends one hook payload to its session's event log, and gives the record its agent session id
 * when that is first learned or a Claude /clear moves it. Codex claims on SessionStart only,
 * then finds the record by payload session_id. Its environment must still name a live Mesa
 * Codex record. Claude retains its log-only fallback for a missing record.
 */
export function recordHookEvent(
  deps: {
    store: SessionStore;
    eventsDir: string;
    clock: Clock;
    home: string;
    /** Read only inside a Mesa session: a config that does not read then refuses the event. */
    secrets: () => readonly string[];
  },
  input: { agent: string; mesaSessionId?: string; payload: string },
): HookEvent | undefined {
  const agent = AgentSchema.safeParse(input.agent);
  if (!agent.success || !AGENTS[agent.data].hookState) {
    throw new MesaError('agent_unavailable', `no hooks for agent ${input.agent}`);
  }
  let id = input.mesaSessionId;
  if (!id || !isSessionId(id)) return undefined;
  let payload: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(input.payload);
    if (parsed && typeof parsed === 'object') payload = parsed as Record<string, unknown>;
  } catch {
    // A payload that is not JSON still marks that the hook fired.
  }
  const agentSessionId = typeof payload.session_id === 'string' ? payload.session_id : undefined;
  const event = typeof payload.hook_event_name === 'string' ? payload.hook_event_name : 'unknown';
  let record = findRecord(deps.store, id);
  let staleCodexClear = false;
  if (agent.data === 'codex') {
    // The environment is only an entry gate and the first SessionStart's claim. Once known,
    // Codex's payload id selects its record, even when an inherited environment names another.
    if (record?.agent !== 'codex' || record.endedAt || !agentSessionId) return undefined;
    const matching = agentSessionHolder(
      deps.store,
      agentSessionId,
      (s) => s.agent === 'codex' && !s.endedAt,
    );
    if (matching) record = matching;
    else if (record.agentSessionId || !['SessionStart', 'SessionEnd'].includes(event)) {
      if (
        event !== 'SessionStart' ||
        payload.source !== 'clear' ||
        !record.agentSessionId ||
        record.agentSessionId === agentSessionId
      )
        return undefined;
      const previous = readHookEvents(deps.eventsDir, record.id).at(-1);
      if (previous?.event !== 'SessionEnd' || previous.agentSessionId !== record.agentSessionId)
        return undefined;
      // /clear starts a different native conversation in the same window. Do not claim it as
      // this record: an inherited MESA_SESSION_ID can also belong to a nested Codex process.
      staleCodexClear = true;
    }
    id = record.id;
  }
  const line: HookEvent = {
    at: deps.clock().toISOString(),
    agent: agent.data,
    event: staleCodexClear ? 'SessionIdentityChanged' : event,
    mesaSessionId: id,
    ...(agentSessionId ? { agentSessionId } : {}),
    payload: redactPayload(payload, deps.home, deps.secrets()),
  };
  // A /clear starts a new conversation in the same agent: its SessionStart names the new id.
  const cleared =
    agent.data === 'claude' && line.event === 'SessionStart' && payload.source === 'clear';
  // A claude started inside the session's claude inherits MESA_SESSION_ID; its events are not ours.
  const moved = Boolean(record?.agentSessionId && agentSessionId !== record.agentSessionId);
  if (agentSessionId && moved && !cleared && !staleCodexClear) return undefined;
  mkdirSync(deps.eventsDir, { recursive: true, mode: 0o700 });
  appendFileSync(eventsLog(deps.eventsDir, id), `${JSON.stringify(line)}\n`);
  // The record follows: to its first id (open and resume set one first, so only a record written
  // without one), or to the one a /clear moved it to. ponytail: under the record's lock, which can
  // hold a hook up to 2 s past its budget when another process has the record; it only waits on
  // those rare changes.
  if (
    record &&
    agentSessionId &&
    agentSessionId !== record.agentSessionId &&
    !staleCodexClear &&
    (agent.data === 'claude' || event === 'SessionStart')
  ) {
    deps.store.update(id, { agentSessionId });
  }
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
  const file = eventsLog(eventsDir, id);
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
