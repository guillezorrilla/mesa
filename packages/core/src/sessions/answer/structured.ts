import { askedQuestion } from '../../agents/claude/prompt.js';
import { parseStreamLine } from '../../agents/claude/stream/events.js';
import { parseAppServerLine } from '../../agents/codex/appserver/events.js';
import { payloadField, toolSummary } from '../../agents/prompt.js';
import { MesaError } from '../../lib/result.js';
import { journalEntries, readJournal } from '../host/journal.js';
import { askHost, type HostRequest, hostSocket } from '../host/socket.js';
import type { SessionRecord } from '../record/record.js';
import type { PendingPrompt, PromptOption } from './pending.js';

// A Structured session's pending prompt (ADR-0029): the request its agent's runner sent (Claude's
// `can_use_tool` control request, AskUserQuestion included; Codex's approval request), read from
// its journal and answered through its host's socket, never its pane. Measured live on claude
// 2.1.325 (#1201): the PermissionRequest hook fires in stream-json mode, so the session's waiting
// state comes from the hooks as before.

/** A request the agent waits on, whichever agent sent it. */
type Waiting = {
  requestId: string;
  tool: string;
  input: Record<string, unknown>;
  /** Claude's suggested rules: what "allow always" adds. */
  suggestions: unknown[];
  /** What a Codex approval asks about, its command or reason. */
  about?: string;
};

/** The request and its prompt as Mesa shows it, which an answer needs both of. */
export type StructuredPrompt = { waiting: Waiting; prompt: PendingPrompt };

/** Option ids a permission offers. */
const ALLOW = 'allow';
const ALWAYS = 'always';
const DENY = 'deny';
/** What a person denied from Mesa tells the agent when they typed no reason. */
const DENIED = 'The person denied this from Mesa.';

/**
 * The request session `id`'s `agent` waits on: the last one in its journal that Mesa has not
 * answered or interrupted, the agent has not cancelled or resolved, and whose turn has not ended.
 */
function waitingRequest(journals: string, id: string, agent: SessionRecord['agent']) {
  const pending = new Map<string, Waiting>();
  // shortcut: reads the whole journal per look; keep an offset if journals grow past a few MB.
  for (const { sent, event } of journalEntries(readJournal(journals, id) ?? [])) {
    if (sent) {
      if (sent.type === 'interrupt' || sent.type === 'stop') pending.clear();
      else if (sent.type === 'allow' || sent.type === 'deny')
        pending.delete(String(sent.requestId));
    } else if (event !== undefined && agent === 'codex') {
      const e = parseAppServerLine(event);
      if (e.type === 'approval')
        pending.set(e.requestId, {
          requestId: e.requestId,
          tool: e.kind === 'command' ? 'Command' : 'File change',
          input: {},
          suggestions: [],
          ...((e.command ?? e.reason) ? { about: e.command ?? e.reason } : {}),
        });
      else if (e.type === 'resolved') pending.delete(e.requestId);
      else if (e.type === 'turn_completed') pending.clear();
    } else if (event !== undefined) {
      const e = parseStreamLine(event);
      if (e.type === 'permission_request')
        pending.set(e.requestId, {
          requestId: e.requestId,
          tool: e.toolName,
          input: e.input,
          suggestions: e.suggestions,
        });
      else if (e.type === 'result') pending.clear();
      else if (payloadField(JSON.parse(event), 'type') === 'control_cancel_request')
        pending.delete(String(payloadField(JSON.parse(event), 'request_id')));
    }
  }
  return [...pending.values()].at(-1);
}

/** The prompt `waiting` is: a question's answers by number, or a permission's answers. */
function promptOf(id: string, waiting: Waiting): PendingPrompt {
  const base = { status: 'pending' as const, session: id, id: waiting.requestId, freeText: true };
  if (waiting.tool === 'AskUserQuestion') {
    const asked = askedQuestion(waiting.input);
    if (!asked)
      return {
        status: 'unsupported',
        session: id,
        reason: `Mesa answers one question of up to 8 answers; decline this one with mesa answer ${id} --text "<why>"`,
      };
    const summary = asked.multiSelect ? `${asked.text} (choose one or more: 1,3)` : asked.text;
    return { ...base, kind: 'question', tool: waiting.tool, summary, options: asked.choices };
  }
  const options: PromptOption[] = [
    { id: ALLOW, label: 'Allow' },
    ...(waiting.suggestions.length ? [{ id: ALWAYS, label: 'Allow always' }] : []),
    { id: DENY, label: 'Deny' },
  ];
  const summary = waiting.about ?? toolSummary(waiting.tool, waiting.input);
  return { ...base, kind: 'permission', tool: waiting.tool, summary, options };
}

/**
 * Session `id`'s pending prompt while its host runs: a question's answers by number, or a
 * permission's Allow, Allow always (when Claude suggests rules) and Deny, where typed text answers
 * a question or is the reason a permission is denied. `unsupported` for an AskUserQuestion Mesa
 * cannot show; none when nothing waits or no host answers.
 */
export async function structuredPrompt(
  deps: { journals: string; hosts: string },
  record: Pick<SessionRecord, 'id' | 'agent'>,
): Promise<StructuredPrompt | undefined> {
  const waiting = waitingRequest(deps.journals, record.id, record.agent);
  if (!waiting) return undefined;
  // The journal outlives the host: a request its process died with waits on nothing now.
  if (!(await askHost(hostSocket(deps.hosts, record.id), { type: 'ping' }))) return undefined;
  return { waiting, prompt: promptOf(record.id, waiting) };
}

/** The host request that gives `choice` as the answer to `found`. */
function hostAnswer(
  { waiting, prompt }: StructuredPrompt,
  choice: { option?: string; text?: string },
): { ask: HostRequest; option?: string; answer: string } {
  const { requestId, input } = waiting;
  const usage = (message: string) => new MesaError('usage', message);
  if (prompt.status !== 'pending') {
    if (choice.text === undefined || choice.option !== undefined) throw usage(prompt.reason);
    return { ask: { type: 'deny', requestId, message: choice.text }, answer: choice.text };
  }
  const options = (choice.option ?? '').split(',').filter(Boolean);
  const chosen = options.map((one) => {
    const found = prompt.options.find((o) => o.id === one);
    if (found) return found;
    const ids = prompt.options.map((o) => o.id).join(', ');
    throw usage(`no option ${one} on this prompt; choose one of: ${ids}`);
  });
  const [first] = chosen;
  if (chosen.length > 1 && prompt.kind === 'permission') throw usage('choose one option');
  if (choice.text !== undefined && first && first.id !== DENY)
    throw usage('pass an option or --text, not both; only deny takes a reason');
  if (prompt.kind === 'question') {
    // Several answers to a multi-select question go back joined, as Claude reads them.
    const answer = first ? chosen.map((o) => o.label).join(', ') : (choice.text ?? '');
    const answers = { [(askedQuestion(input) ?? { text: '' }).text]: answer };
    return {
      ask: { type: 'allow', requestId, input: { ...input, answers } },
      ...(first ? { option: chosen.map((o) => o.id).join(',') } : {}),
      answer,
    };
  }
  if (!first || first.id === DENY) {
    const message = choice.text ?? DENIED;
    return {
      ask: { type: 'deny', requestId, message },
      ...(first ? { option: DENY } : {}),
      answer: choice.text ?? first?.label ?? '',
    };
  }
  const permissions = first.id === ALWAYS ? waiting.suggestions : undefined;
  return {
    ask: { type: 'allow', requestId, input, ...(permissions ? { permissions } : {}) },
    option: first.id,
    answer: first.label,
  };
}

/**
 * Answers session `id`'s `found` prompt through its host: options by id (a multi-select question
 * takes several, `1,3`), typed text as a question's answer or a denial's reason (with `deny` or
 * alone). Returns the option chosen and the answer as a person reads it.
 */
export async function answerStructured(
  hosts: string,
  id: string,
  found: StructuredPrompt,
  choice: { option?: string; text?: string },
): Promise<{ option?: string; answer: string }> {
  if (choice.option === undefined && choice.text === undefined)
    throw new MesaError('usage', 'pass an option or --text');
  const { ask, ...answered } = hostAnswer(found, choice);
  const reply = await askHost(hostSocket(hosts, id), ask);
  if (!reply) throw new MesaError('agent_unavailable', `session ${id}'s host does not answer`);
  if (!reply.ok) throw new MesaError('agent_unavailable', `session ${id}'s host: ${reply.error}`);
  return answered;
}
