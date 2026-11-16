// What `codex app-server` prints on stdout, one JSON-RPC message per line, as typed values
// (docs/spikes/structured-chat.md, section 3; schema from `codex app-server generate-json-schema`,
// codex-cli 0.169.0). Only the fields Mesa reads are kept. Mesa's request ids name their method
// (`<method>#<n>`, runner.ts), so a response line is typed on its own, in a journal replay too. A
// line that is not JSON, or a message Mesa does not know, is an `other` event: parsing never throws.

/** One thread item, the unit Codex streams a turn in; `other` for the kinds Mesa does not show. */
export type CodexItem =
  | { kind: 'userMessage'; id: string; text: string }
  /** `phase`: `commentary` is a step line, `final_answer` the reply (spike section 3). */
  | { kind: 'agentMessage'; id: string; text: string; phase: string | undefined }
  | { kind: 'reasoning'; id: string; text: string }
  | {
      kind: 'commandExecution';
      id: string;
      command: string;
      status: string;
      output: string;
      exitCode: number | undefined;
    }
  | {
      kind: 'fileChange';
      id: string;
      status: string;
      changes: { path: string; diff: string; change: string }[];
    }
  | { kind: 'mcpToolCall'; id: string; server: string; tool: string; status: string; error: string }
  | { kind: 'webSearch'; id: string; query: string }
  | { kind: 'contextCompaction'; id: string }
  | { kind: 'other'; id: string; type: string };

export type AppServerEvent =
  /** thread/start or thread/resume answered: the thread Mesa now talks to. */
  | {
      type: 'thread';
      threadId: string;
      model: string;
      /** The approval policy and sandbox (`readOnly`, `workspaceWrite`, `dangerFullAccess`) it runs with. */
      approvalPolicy?: string;
      sandbox?: string;
    }
  | { type: 'turn_started'; turnId: string }
  /** `status`: completed, interrupted or failed. */
  | { type: 'turn_completed'; turnId: string; status: string; error: string | undefined }
  | { type: 'item_started'; item: CodexItem }
  | { type: 'item_completed'; item: CodexItem }
  /** A streamed piece of an item: the reply's text, a reasoning summary, or a command's output. */
  | { type: 'delta'; kind: 'text' | 'reasoning' | 'output'; itemId: string; text: string }
  /** A command or file change waiting on Mesa's answer; `requestId` answers it (runner.ts). */
  | {
      type: 'approval';
      requestId: string;
      /** The id as Codex sent it, which the answer carries back. */
      rpcId: string | number;
      kind: 'command' | 'file';
      itemId: string;
      command: string | undefined;
      reason: string | undefined;
    }
  /** A request Codex sends that Mesa does not answer, by its method. */
  | { type: 'server_request'; requestId: string; rpcId: string | number; method: string }
  /** An approval answered, by Mesa or another client: its card goes. */
  | { type: 'resolved'; requestId: string }
  | {
      type: 'token_usage';
      inputTokens: number;
      outputTokens: number;
      cachedInputTokens: number;
      totalTokens: number;
      contextWindow: number | undefined;
    }
  /** skills/list answered: the names for the slash menu. */
  | { type: 'skills'; names: string[] }
  /** model/list answered. */
  | { type: 'models'; models: { id: string; name: string; isDefault: boolean }[] }
  /** account/usage/read answered, as Codex sent it, for the footer. */
  | { type: 'usage'; usage: Record<string, unknown> }
  | { type: 'error'; message: string; willRetry: boolean }
  /** Any other response to Mesa's request, by its method. */
  | { type: 'response'; id: string; method: string; ok: boolean; error: string | undefined }
  /** account/rateLimits/updated, as Codex sent it, for the footer. */
  | { type: 'rate_limits'; rateLimits: Record<string, unknown> }
  /** Any other notification (status, rate limits, MCP startup, hooks), by its method. */
  | { type: 'notification'; method: string }
  | { type: 'other'; raw: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const list = (v: unknown) => (Array.isArray(v) ? v : []);
/** A JSON-RPC id as a string; Codex's own ids are numbers. */
export const requestKey = (id: unknown) => (typeof id === 'number' ? String(id) : str(id));

/** The text of a list of `{text}` parts, or of strings. */
const texts = (parts: unknown, join = '\n\n') =>
  list(parts)
    .map((part) => (typeof part === 'string' ? part : isObj(part) ? str(part.text) : ''))
    .filter(Boolean)
    .join(join);

function item(raw: unknown): CodexItem {
  const d = isObj(raw) ? raw : {};
  const id = str(d.id);
  switch (d.type) {
    case 'userMessage':
      return { kind: 'userMessage', id, text: texts(d.content, '\n') };
    case 'agentMessage':
      return {
        kind: 'agentMessage',
        id,
        text: str(d.text),
        phase: typeof d.phase === 'string' ? d.phase : undefined,
      };
    case 'reasoning':
      return { kind: 'reasoning', id, text: texts(d.summary) };
    case 'commandExecution':
      return {
        kind: 'commandExecution',
        id,
        command: str(d.command),
        status: str(d.status),
        output: str(d.aggregatedOutput),
        exitCode: num(d.exitCode),
      };
    case 'fileChange':
      return {
        kind: 'fileChange',
        id,
        status: str(d.status),
        changes: list(d.changes).flatMap((c) =>
          isObj(c)
            ? [
                {
                  path: str(c.path),
                  diff: str(c.diff),
                  change: isObj(c.kind) ? str(c.kind.type) : '',
                },
              ]
            : [],
        ),
      };
    case 'mcpToolCall':
      return {
        kind: 'mcpToolCall',
        id,
        server: str(d.server),
        tool: str(d.tool),
        status: str(d.status),
        error: isObj(d.error) ? str(d.error.message) : '',
      };
    case 'webSearch':
      return { kind: 'webSearch', id, query: str(d.query) };
    case 'contextCompaction':
      return { kind: 'contextCompaction', id };
    default:
      return { kind: 'other', id, type: str(d.type) };
  }
}

/** A response to Mesa's request `<method>#<n>`, typed by that method. */
function response(method: string, d: Obj, line: string): AppServerEvent {
  const error = isObj(d.error) ? str(d.error.message, 'error') : undefined;
  const result = isObj(d.result) ? d.result : {};
  if (error === undefined)
    switch (method) {
      case 'thread/start':
      case 'thread/resume': {
        const thread = isObj(result.thread) ? result.thread : {};
        if (!str(thread.id)) break;
        const sandbox = isObj(result.sandbox) ? str(result.sandbox.type) : '';
        return {
          type: 'thread',
          threadId: str(thread.id),
          model: str(result.model),
          ...(str(result.approvalPolicy) ? { approvalPolicy: str(result.approvalPolicy) } : {}),
          ...(sandbox ? { sandbox } : {}),
        };
      }
      case 'skills/list':
        return {
          type: 'skills',
          names: list(result.data).flatMap((entry) =>
            isObj(entry)
              ? list(entry.skills).flatMap((s) =>
                  isObj(s) && s.enabled !== false && str(s.name) ? [str(s.name)] : [],
                )
              : [],
          ),
        };
      case 'model/list':
        return {
          type: 'models',
          models: list(result.data).flatMap((m) =>
            isObj(m) && str(m.id) && m.hidden !== true
              ? [
                  {
                    id: str(m.id),
                    name: str(m.displayName, str(m.id)),
                    isDefault: m.isDefault === true,
                  },
                ]
              : [],
          ),
        };
      case 'account/usage/read':
        return { type: 'usage', usage: result };
    }
  if (!method) return { type: 'other', raw: line };
  return { type: 'response', id: str(d.id), method, ok: error === undefined, error };
}

/** A server request: an approval Mesa shows as a card, or one it leaves unanswered. */
function serverRequest(method: string, rpcId: string | number, p: Obj): AppServerEvent {
  const requestId = requestKey(rpcId);
  if (
    method === 'item/commandExecution/requestApproval' ||
    method === 'item/fileChange/requestApproval'
  )
    return {
      type: 'approval',
      requestId,
      rpcId,
      kind: method.includes('command') ? 'command' : 'file',
      itemId: str(p.itemId),
      command: typeof p.command === 'string' ? p.command : undefined,
      reason: typeof p.reason === 'string' ? p.reason : undefined,
    };
  return { type: 'server_request', requestId, rpcId, method };
}

const DELTAS: Record<string, 'text' | 'reasoning' | 'output'> = {
  'item/agentMessage/delta': 'text',
  'item/reasoning/summaryTextDelta': 'reasoning',
  'item/commandExecution/outputDelta': 'output',
};

function notification(method: string, p: Obj): AppServerEvent {
  const turn = isObj(p.turn) ? p.turn : {};
  const kind = DELTAS[method];
  if (kind) return { type: 'delta', kind, itemId: str(p.itemId), text: str(p.delta) };
  switch (method) {
    case 'turn/started':
      return { type: 'turn_started', turnId: str(turn.id) };
    case 'turn/completed':
      return {
        type: 'turn_completed',
        turnId: str(turn.id),
        status: str(turn.status),
        error: isObj(turn.error) ? str(turn.error.message) : undefined,
      };
    case 'item/started':
      return { type: 'item_started', item: item(p.item) };
    case 'item/completed':
      return { type: 'item_completed', item: item(p.item) };
    case 'serverRequest/resolved':
      return { type: 'resolved', requestId: requestKey(p.requestId) };
    case 'account/rateLimits/updated':
      return { type: 'rate_limits', rateLimits: isObj(p.rateLimits) ? p.rateLimits : {} };
    case 'thread/tokenUsage/updated': {
      const usage = isObj(p.tokenUsage) ? p.tokenUsage : {};
      const total = isObj(usage.total) ? usage.total : {};
      return {
        type: 'token_usage',
        inputTokens: num(total.inputTokens) ?? 0,
        outputTokens: num(total.outputTokens) ?? 0,
        cachedInputTokens: num(total.cachedInputTokens) ?? 0,
        totalTokens: num(total.totalTokens) ?? 0,
        contextWindow: num(usage.modelContextWindow),
      };
    }
    case 'error': {
      const error = isObj(p.error) ? p.error : {};
      return { type: 'error', message: str(error.message), willRetry: p.willRetry === true };
    }
    default:
      return { type: 'notification', method };
  }
}

/** One stdout line as an event; never throws. */
export function parseAppServerLine(line: string): AppServerEvent {
  let d: unknown;
  try {
    d = JSON.parse(line);
  } catch {
    return { type: 'other', raw: line };
  }
  if (!isObj(d)) return { type: 'other', raw: line };
  const method = typeof d.method === 'string' ? d.method : undefined;
  const params = isObj(d.params) ? d.params : {};
  if (method && (typeof d.id === 'string' || typeof d.id === 'number'))
    return serverRequest(method, d.id, params);
  if (method) return notification(method, params);
  if ('id' in d) return response(str(d.id).split('#')[0] ?? '', d, line);
  return { type: 'other', raw: line };
}
