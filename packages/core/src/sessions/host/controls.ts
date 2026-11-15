import { parseStreamLine } from '../../agents/claude/stream/events.js';
import { parseAppServerLine } from '../../agents/codex/appserver/events.js';
import { CLAUDE_MODEL_ALIASES, EFFORTS, requireSessionModel } from '../../agents/launch-flags.js';
import { CLAUDE_PERMISSION_MODES, isClaudePermissionMode } from '../../agents/names.js';
import { payloadField } from '../../agents/prompt.js';
import { MesaError } from '../../lib/result.js';
import { inTurn } from '../record/lifecycle.js';
import type { SessionRecord } from '../record/record.js';
import type { SessionStore } from '../record/store.js';
import { journalEntries, readJournal } from './journal.js';
import { askHost, type HostRequest, hostSocket } from './socket.js';

// A Structured session's model, effort and permission mode (ADR-0029, #1201), as its agent last
// confirmed them in its journal, and the changes Mesa makes to them through its host. Measured
// live on claude 2.1.325: `set_model` answers with the model and the next init names it; `/effort
// <level>` answers with a synthetic "Set effort level to <level>"; `set_permission_mode` answers
// with the mode and a `system/status` event. Codex takes a model and effort on its next turn.

/** What a session's controls show, and what each picker offers. */
export type SessionControls = {
  session: string;
  agent: 'claude' | 'codex';
  model?: string;
  effort?: string;
  /** Claude's permission mode; Codex has none to set mid-session. */
  mode?: string;
  models: string[];
  efforts: readonly string[];
  modes: readonly string[];
  /** The last `/usage` reply, Claude's alone. */
  usage?: string;
  /** An effort asked for mid-turn, which Claude takes once the turn ends. */
  effortQueued?: string;
};

export type ControlChange = { model?: string; effort?: string; mode?: string };

/** What Claude answers `/effort <level>` with. */
const EFFORT_SET = /^Set effort level to (\w+)/;
/** How long a change waits for the agent to confirm it. */
const CONFIRM_MS = 10_000;
const POLL_MS = 200;

/** A synthetic reply's text: what Claude Code wrote itself for a slash command. */
const syntheticText = (event: ReturnType<typeof parseStreamLine>) =>
  event.type === 'assistant' && event.synthetic
    ? event.content.map((b) => (b.type === 'text' ? b.text : '')).join('')
    : undefined;

/** A Structured session of an agent with controls; others are refused as usage. */
function structuredAgent(record: SessionRecord): 'claude' | 'codex' {
  if (record.view !== 'structured' || (record.agent !== 'claude' && record.agent !== 'codex'))
    throw new MesaError(
      'usage',
      `session ${record.id} is not in Structured view; mesa sessions view ${record.id} structured first`,
    );
  return record.agent;
}

/** Session `record`'s controls from its journal's `lines`, its record's model and effort first. */
export function readControls(record: SessionRecord, lines: readonly string[]): SessionControls {
  const agent = structuredAgent(record);
  const controls: SessionControls = {
    session: record.id,
    agent,
    ...(record.model ? { model: record.model } : {}),
    ...(record.effort ? { effort: record.effort } : {}),
    models: agent === 'claude' ? [...CLAUDE_MODEL_ALIASES] : [],
    efforts: EFFORTS[agent],
    modes: agent === 'claude' ? CLAUDE_PERMISSION_MODES : [],
  };
  let askedUsage = false;
  for (const { sent, event } of journalEntries(lines)) {
    if (sent) {
      askedUsage = sent.type === 'user' && sent.text === '/usage';
      if (agent === 'codex' && sent.type === 'model') {
        if (typeof sent.model === 'string') controls.model = sent.model;
        if (typeof sent.effort === 'string') controls.effort = sent.effort;
      }
      continue;
    }
    if (event === undefined) continue;
    if (agent === 'codex') {
      const e = parseAppServerLine(event);
      if (e.type === 'thread' && e.model && !controls.model) controls.model = e.model;
      if (e.type === 'models') controls.models = e.models.map((m) => m.id);
      continue;
    }
    const e = parseStreamLine(event);
    if (e.type === 'init') {
      if (e.model) controls.model = e.model;
      if (e.permissionMode) controls.mode = e.permissionMode;
    } else if (e.type === 'control_response' && e.ok) {
      const { model, mode } = e.response;
      if (typeof model === 'string') controls.model = model;
      if (typeof mode === 'string') controls.mode = mode;
    } else if (e.type === 'system' && e.subtype === 'status') {
      const mode = payloadField(JSON.parse(event), 'permissionMode');
      if (typeof mode === 'string') controls.mode = mode;
    }
    const text = syntheticText(e);
    if (text === undefined) continue;
    const effort = EFFORT_SET.exec(text)?.[1];
    if (effort) controls.effort = effort;
    if (askedUsage) controls.usage = text;
    askedUsage = false;
  }
  return controls;
}

export type ControlDeps = {
  store: SessionStore;
  journals: string;
  hosts: string;
  sleep: (ms: number) => Promise<void>;
};

/** Session `id`'s controls as its journal shows them now. */
export const sessionControls = (deps: Pick<ControlDeps, 'store' | 'journals'>, id: string) =>
  readControls(deps.store.get(id), readJournal(deps.journals, id) ?? []);

/**
 * Whether Claude's events since a change confirm it: true, false with the agent's reason, or
 * undefined while they do not say yet.
 */
function confirmed(
  events: readonly string[],
  change: ControlChange,
): { ok: true } | { ok: false; reason: string } | undefined {
  let model = change.model === undefined;
  let effort = change.effort === undefined;
  let mode = change.mode === undefined;
  for (const line of events) {
    const e = parseStreamLine(line);
    if (e.type === 'control_response') {
      if (!e.ok) return { ok: false, reason: e.error ?? 'the agent refused it' };
      if (typeof e.response.model === 'string') model = true;
      if (typeof e.response.mode === 'string') mode = true;
    }
    // Only a reply about effort speaks for it: another command's, a /usage say, is not a refusal.
    const text = syntheticText(e);
    if (text !== undefined && !effort && /effort/i.test(text)) {
      if (!EFFORT_SET.test(text)) return { ok: false, reason: text.trim() };
      effort = true;
    }
  }
  return model && effort && mode ? { ok: true } : undefined;
}

/**
 * Changes session `id`'s model, effort or mode through its host, and returns its controls once the
 * agent confirms (Claude) or takes them for its next turn (Codex). The record keeps a new model
 * and effort, so a switch or a resume starts with them. Refused as usage for a value the agent
 * does not take and for a mode on Codex; agent_unavailable when the host or agent refuses, or does
 * not confirm in 10 s.
 */
export async function applyControls(
  deps: ControlDeps,
  id: string,
  change: ControlChange,
): Promise<SessionControls> {
  const record = deps.store.get(id);
  const agent = structuredAgent(record);
  const { model, effort, mode } = change;
  if (model === undefined && effort === undefined && mode === undefined)
    throw new MesaError('usage', 'pass a model, an effort or a mode');
  requireSessionModel(agent, { model, effort });
  if (mode !== undefined && agent !== 'claude')
    throw new MesaError('usage', `${agent} has no permission modes to set`);
  if (mode !== undefined && !isClaudePermissionMode(mode))
    throw new MesaError('usage', `mode is one of ${CLAUDE_PERMISSION_MODES.join(', ')}`);
  const before = readJournal(deps.journals, id)?.length ?? 0;
  const socket = hostSocket(deps.hosts, id);
  const unavailable = (why: string) => new MesaError('agent_unavailable', `session ${id}: ${why}`);
  const asks: HostRequest[] = [
    ...(model || effort
      ? [{ type: 'model' as const, ...(model ? { model } : {}), ...(effort ? { effort } : {}) }]
      : []),
    ...(mode
      ? [{ type: 'mode' as const, mode: mode as (typeof CLAUDE_PERMISSION_MODES)[number] }]
      : []),
  ];
  for (const ask of asks) {
    const reply = await askHost(socket, ask);
    if (!reply) throw unavailable('its host does not answer');
    if (!reply.ok) throw unavailable(reply.error);
  }
  // Mid-turn Claude queues `/effort` behind the turn: the rest is confirmed, the effort shown queued.
  const queued = effort !== undefined && inTurn(record);
  const awaited = queued ? { ...change, effort: undefined } : change;
  if (agent === 'claude')
    for (let waited = 0; ; waited += POLL_MS) {
      const since = journalEntries((readJournal(deps.journals, id) ?? []).slice(before));
      const events = since.flatMap((e) => (e.event === undefined ? [] : [e.event]));
      const verdict = confirmed(events, awaited);
      if (verdict?.ok) break;
      if (verdict && !verdict.ok) throw unavailable(verdict.reason);
      if (waited >= CONFIRM_MS) throw unavailable('the agent did not confirm the change in 10 s');
      await deps.sleep(POLL_MS);
    }
  if (model !== undefined || effort !== undefined)
    deps.store.update(id, { ...(model ? { model } : {}), ...(effort ? { effort } : {}) });
  const after = sessionControls(deps, id);
  return queued ? { ...after, effortQueued: effort } : after;
}
