import { parseStreamLine, type StreamEvent } from '../../agents/claude/stream/events.js';
import { payloadField, toolSummary } from '../../agents/prompt.js';
import { MesaError } from '../../lib/result.js';
import { readJournal } from '../host/journal.js';
import { askHost, hostSocket } from '../host/socket.js';
import type { PendingPrompt, PromptOption } from './pending.js';

// A Structured session's pending prompt (ADR-0029): the permission request its agent sent as a
// `control_request` (an AskUserQuestion is one too), read from its journal, and answered through
// its host's socket, never its pane. Measured live on claude 2.1.325 (#1201): the PermissionRequest
// hook fires in stream-json mode, so the session's waiting state comes from the hooks as before.

type Request = Extract<StreamEvent, { type: 'permission_request' }>;
type Pending = Extract<PendingPrompt, { status: 'pending' }>;

/**
 * The request session `id`'s agent waits on: the last one in its journal that Mesa has not
 * answered, claude has not cancelled, and whose turn has not ended.
 */
export function pendingRequest(journals: string, id: string): Request | undefined {
  const pending = new Map<string, Request>();
  // shortcut: reads the whole journal per look; keep an offset if journals grow past a few MB.
  for (const line of readJournal(journals, id) ?? []) {
    let entry: { sent?: { type?: string; requestId?: string }; event?: unknown };
    try {
      entry = JSON.parse(line);
    } catch {
      continue;
    }
    const { sent, event } = entry;
    if (sent?.requestId && (sent.type === 'allow' || sent.type === 'deny'))
      pending.delete(sent.requestId);
    if (event === undefined) continue;
    const cancelled = payloadField(event, 'type') === 'control_cancel_request';
    if (cancelled) pending.delete(String(payloadField(event, 'request_id')));
    const parsed = parseStreamLine(JSON.stringify(event));
    if (parsed.type === 'permission_request') pending.set(parsed.requestId, parsed);
    else if (parsed.type === 'result') pending.clear();
  }
  return [...pending.values()].at(-1);
}

/** AskUserQuestion's one single-choice question, its text and answer labels; else undefined. */
function question(request: Request) {
  const questions = payloadField(request.input, 'questions');
  if (!Array.isArray(questions) || questions.length !== 1) return undefined;
  const [asked] = questions;
  const text = payloadField(asked, 'question');
  const options = payloadField(asked, 'options');
  if (typeof text !== 'string' || payloadField(asked, 'multiSelect') === true) return undefined;
  if (!Array.isArray(options) || !options.length) return undefined;
  const choices: PromptOption[] = [];
  for (const [i, option] of options.entries()) {
    const label = payloadField(option, 'label');
    if (typeof label !== 'string') return undefined;
    const description = payloadField(option, 'description');
    choices.push({
      id: String(i + 1),
      label,
      ...(typeof description === 'string' && description ? { description } : {}),
    });
  }
  return { text, choices };
}

/**
 * Session `id`'s pending request as `mesa prompt` shows it: a question's answers by number, or a
 * permission's Allow, Allow always (when claude suggests rules), and Deny; typed text answers a
 * question, or denies a permission with that message. `unsupported` for an AskUserQuestion of
 * several questions or many choices; none when it waits on nothing.
 */
export function structuredPrompt(
  journals: string,
  id: string,
): { request: Request; prompt: PendingPrompt } | undefined {
  const request = pendingRequest(journals, id);
  if (!request) return undefined;
  const base = { status: 'pending' as const, session: id, id: request.requestId, freeText: true };
  if (request.toolName === 'AskUserQuestion') {
    const asked = question(request);
    const prompt: PendingPrompt = asked
      ? {
          ...base,
          kind: 'question',
          tool: request.toolName,
          summary: asked.text,
          options: asked.choices,
        }
      : {
          status: 'unsupported',
          session: id,
          reason: 'Mesa answers one single-choice question; this one asks more',
        };
    return { request, prompt };
  }
  const options: PromptOption[] = [
    { id: 'allow', label: 'Allow' },
    ...(request.suggestions.length ? [{ id: 'always', label: 'Allow always' }] : []),
    { id: 'deny', label: 'Deny' },
  ];
  const summary = toolSummary(request.toolName, request.input);
  return {
    request,
    prompt: { ...base, kind: 'permission', tool: request.toolName, summary, options },
  };
}

/** What a person denied from Mesa tells the agent when they typed no reason. */
const DENIED = 'The person denied this from Mesa.';

/**
 * Answers `prompt` (structuredPrompt's) for session `id` through its host: a question's option or
 * typed text as AskUserQuestion's answer, Allow (always, with claude's suggested rules), or Deny
 * with the typed text as its message. Returns the option chosen and the answer as a person reads it.
 */
export async function answerRequest(
  hosts: string,
  id: string,
  { request, prompt }: { request: Request; prompt: Pending },
  choice: { option?: string; text?: string },
): Promise<{ option?: string; answer: string }> {
  const option =
    choice.option === undefined ? undefined : prompt.options.find((o) => o.id === choice.option);
  if (choice.option !== undefined && !option) {
    const ids = prompt.options.map((o) => o.id).join(', ');
    throw new MesaError(
      'usage',
      `no option ${choice.option} on this prompt; choose one of: ${ids}`,
    );
  }
  const { requestId, input } = request;
  let ask: Parameters<typeof askHost>[1];
  if (prompt.kind === 'question') {
    const answer = option?.label ?? choice.text ?? '';
    ask = { type: 'allow', requestId, input: { ...input, answers: { [prompt.summary]: answer } } };
  } else if (option?.id === 'deny' || !option) {
    ask = { type: 'deny', requestId, message: choice.text ?? DENIED };
  } else {
    const permissions = option.id === 'always' ? request.suggestions : undefined;
    ask = { type: 'allow', requestId, input, ...(permissions ? { permissions } : {}) };
  }
  const reply = await askHost(hostSocket(hosts, id), ask);
  if (!reply) throw new MesaError('agent_unavailable', `session ${id}'s host does not answer`);
  if (!reply.ok) throw new MesaError('agent_unavailable', `session ${id}'s host: ${reply.error}`);
  return option ? { option: option.id, answer: option.label } : { answer: choice.text ?? '' };
}
