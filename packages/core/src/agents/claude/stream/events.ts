// What `claude -p --input-format stream-json --output-format stream-json` prints, one JSON object
// per line, as typed values (docs/spikes/structured-chat.md, section 1; Claude Code 2.1.325). Only
// the fields Mesa reads are kept. A line that is not JSON, or an event type or subtype Mesa does not
// know, is an `other` event holding the raw line: parsing never throws.

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
  | { type: 'tool_result'; toolUseId: string; content: string; isError: boolean }
  | { type: 'other'; raw: unknown };

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

export type StreamEvent =
  | {
      type: 'init';
      sessionId: string;
      model: string;
      permissionMode: string;
      slashCommands: string[];
      skills: string[];
      tools: string[];
    }
  /** A streamed piece of the reply being written: text, thinking, or a tool call's input. */
  | {
      type: 'delta';
      kind: 'text' | 'thinking' | 'input_json';
      text: string;
      index: number;
      sidechain: boolean;
    }
  /** Any other `stream_event` (message and block starts and stops), by its own type name. */
  | { type: 'stream'; event: string }
  /** `synthetic`: Claude Code wrote it itself (a slash command's output), not the model. */
  | { type: 'assistant'; content: ContentBlock[]; synthetic: boolean; sidechain: boolean }
  /** A user turn: Claude's tool results come back as these. */
  | { type: 'user'; content: ContentBlock[]; sidechain: boolean }
  | {
      type: 'result';
      sessionId: string;
      subtype: string;
      isError: boolean;
      result: string;
      costUsd: number | undefined;
      durationMs: number | undefined;
      turns: number | undefined;
      usage: TokenUsage | undefined;
    }
  | {
      type: 'permission_request';
      requestId: string;
      toolName: string;
      toolUseId: string | undefined;
      input: Record<string, unknown>;
      /** The rules "allow always" would add (`permission_suggestions`), as claude sent them. */
      suggestions: unknown[];
    }
  /** A control request Claude sends that is not a permission request, by its subtype. */
  | { type: 'control_request'; requestId: string; subtype: string }
  | { type: 'control_response'; requestId: string; ok: boolean; error: string | undefined }
  | { type: 'compact_boundary'; trigger: string | undefined; preTokens: number | undefined }
  /** A `system` event other than init and compact_boundary, by its subtype. */
  | { type: 'system'; subtype: string }
  | { type: 'other'; raw: string };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const str = (v: unknown, fallback = '') => (typeof v === 'string' ? v : fallback);
const num = (v: unknown) => (typeof v === 'number' ? v : undefined);
const strings = (v: unknown) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);

/** A tool result's content is text or a list of blocks; the text of either. */
function resultText(content: unknown): string {
  if (typeof content === 'string') return content;
  if (!Array.isArray(content)) return '';
  return content
    .map((part) => (isObj(part) && typeof part.text === 'string' ? part.text : ''))
    .join('');
}

function block(raw: unknown): ContentBlock {
  if (!isObj(raw)) return { type: 'other', raw };
  switch (raw.type) {
    case 'text':
      return { type: 'text', text: str(raw.text) };
    case 'thinking':
      return { type: 'thinking', text: str(raw.thinking) };
    case 'tool_use':
      return {
        type: 'tool_use',
        id: str(raw.id),
        name: str(raw.name),
        input: isObj(raw.input) ? raw.input : {},
      };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: str(raw.tool_use_id),
        content: resultText(raw.content),
        isError: raw.is_error === true,
      };
    default:
      return { type: 'other', raw };
  }
}

/** A subagent's events carry the id of the tool call that started it. */
const sidechain = (d: Obj) => typeof d.parent_tool_use_id === 'string';

/** A message's content: a bare string is one text block. */
const blocks = (message: unknown): ContentBlock[] => {
  const content = isObj(message) ? message.content : undefined;
  if (typeof content === 'string') return [{ type: 'text', text: content }];
  return Array.isArray(content) ? content.map(block) : [];
};

function usage(raw: unknown): TokenUsage | undefined {
  if (!isObj(raw)) return undefined;
  return {
    inputTokens: num(raw.input_tokens) ?? 0,
    outputTokens: num(raw.output_tokens) ?? 0,
    cacheReadTokens: num(raw.cache_read_input_tokens) ?? 0,
    cacheCreationTokens: num(raw.cache_creation_input_tokens) ?? 0,
  };
}

/** A `content_block_delta`'s delta type: the kind Mesa names it and the field holding its text. */
const DELTA_KINDS = {
  text_delta: { kind: 'text', field: 'text' },
  thinking_delta: { kind: 'thinking', field: 'thinking' },
  input_json_delta: { kind: 'input_json', field: 'partial_json' },
} as const;

function fromObject(d: Obj, line: string): StreamEvent {
  const other: StreamEvent = { type: 'other', raw: line };
  switch (d.type) {
    case 'system':
      if (d.subtype === 'init')
        return {
          type: 'init',
          sessionId: str(d.session_id),
          model: str(d.model),
          permissionMode: str(d.permissionMode),
          slashCommands: strings(d.slash_commands),
          skills: strings(d.skills),
          tools: strings(d.tools),
        };
      if (d.subtype === 'compact_boundary') {
        const meta = isObj(d.compact_metadata) ? d.compact_metadata : {};
        return {
          type: 'compact_boundary',
          trigger: typeof meta.trigger === 'string' ? meta.trigger : undefined,
          preTokens: num(meta.pre_tokens),
        };
      }
      return typeof d.subtype === 'string' ? { type: 'system', subtype: d.subtype } : other;
    case 'stream_event': {
      if (!isObj(d.event) || typeof d.event.type !== 'string') return other;
      const delta = d.event.type === 'content_block_delta' ? d.event.delta : undefined;
      const kind = isObj(delta) ? DELTA_KINDS[delta.type as keyof typeof DELTA_KINDS] : undefined;
      if (isObj(delta) && kind)
        return {
          type: 'delta',
          kind: kind.kind,
          text: str(delta[kind.field]),
          index: num(d.event.index) ?? 0,
          sidechain: sidechain(d),
        };
      return { type: 'stream', event: d.event.type };
    }
    case 'assistant':
      return {
        type: 'assistant',
        content: blocks(d.message),
        synthetic: isObj(d.message) && d.message.model === '<synthetic>',
        sidechain: sidechain(d),
      };
    case 'user':
      return { type: 'user', content: blocks(d.message), sidechain: sidechain(d) };
    case 'result':
      return {
        type: 'result',
        sessionId: str(d.session_id),
        subtype: str(d.subtype),
        isError: d.is_error === true,
        result: str(d.result),
        costUsd: num(d.total_cost_usd),
        durationMs: num(d.duration_ms),
        turns: num(d.num_turns),
        usage: usage(d.usage),
      };
    case 'control_request': {
      const request = isObj(d.request) ? d.request : {};
      const requestId = str(d.request_id);
      if (request.subtype === 'can_use_tool')
        return {
          type: 'permission_request',
          requestId,
          toolName: str(request.tool_name),
          toolUseId: typeof request.tool_use_id === 'string' ? request.tool_use_id : undefined,
          input: isObj(request.input) ? request.input : {},
          suggestions: Array.isArray(request.permission_suggestions)
            ? request.permission_suggestions
            : [],
        };
      return { type: 'control_request', requestId, subtype: str(request.subtype) };
    }
    case 'control_response': {
      const response = isObj(d.response) ? d.response : {};
      return {
        type: 'control_response',
        requestId: str(response.request_id),
        ok: response.subtype === 'success',
        error: typeof response.error === 'string' ? response.error : undefined,
      };
    }
    default:
      return other;
  }
}

/** One stdout line as an event; never throws. */
export function parseStreamLine(line: string): StreamEvent {
  let raw: unknown;
  try {
    raw = JSON.parse(line);
  } catch {
    return { type: 'other', raw: line };
  }
  return isObj(raw) ? fromObject(raw, line) : { type: 'other', raw: line };
}
