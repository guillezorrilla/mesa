// The parts of a log message a person can act on (CONTEXT.md, Logs panel): request ids to filter
// by, HTTP statuses to tint, slow durations to mark. Pure, so the app bundles it (`@mesa/core/browser`).

export type MessagePart = {
  text: string;
  /** A request, trace or correlation id this part names: every line of that request shares it. */
  request?: string;
  /** An HTTP status: `failed` for 5xx, `waiting` for 4xx. */
  status?: 'failed' | 'waiting';
  /** A duration of a second or more. */
  slow?: boolean;
};

/** `reqId=7f3a`, `requestId: 7f3a`, `traceId=...`, `trace_id`, `X-Request-Id: ...`, `correlationId`. */
const REQUEST =
  /\b(?:req(?:uest)?[-_]?id|trace[-_]?id|x-request-id|correlation[-_]?id)["']?\s*[=:]\s*["']?([A-Za-z0-9][\w.-]{2,})/gi;
/**
 * A status after a method and path (`GET /tides 500`), named (`status=503`), with its reason in
 * Spring's words (`500 INTERNAL_SERVER_ERROR`), or after an access log's request (`"GET /x HTTP/1.1" 500`).
 */
const STATUS =
  /\b(?:(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s+\S+\s+|[Ss]tatus(?:Code)?["']?\s*[=:]\s*["']?)([1-5]\d\d)\b|\b([1-5]\d\d)(?=\s+[A-Z]+_[A-Z_]+\b|\s+(?:NOT_FOUND|CONFLICT|FORBIDDEN|UNAUTHORIZED)\b)|HTTP\/[\d.]+"\s+([1-5]\d\d)\b/g;
const DURATION = /\b(\d+(?:\.\d+)?)\s?(ms|s)\b/g;

type Found = { start: number; end: number; part: Omit<MessagePart, 'text'> };

/** The request ids `message` names, in order. */
export const requestIds = (message: string) =>
  [...message.matchAll(REQUEST)].map((match) => match[1] ?? '').filter(Boolean);

/** Whether `message` names request `id` (requestIds), exactly. */
export const namesRequest = (message: string, id: string) => requestIds(message).includes(id);

/** `message` split into plain text and the parts above, in order, never overlapping. */
export function messageParts(message: string): MessagePart[] {
  const found: Found[] = [];
  for (const match of message.matchAll(REQUEST))
    found.push({
      start: match.index,
      end: match.index + match[0].length,
      part: { request: match[1] },
    });
  for (const match of message.matchAll(STATUS)) {
    const code = match[1] ?? match[2] ?? match[3] ?? '';
    if (code < '400') continue;
    const end = match.index + match[0].length;
    found.push({ start: end - 3, end, part: { status: code >= '500' ? 'failed' : 'waiting' } });
  }
  for (const match of message.matchAll(DURATION)) {
    const ms = Number(match[1]) * (match[2] === 's' ? 1000 : 1);
    if (ms >= 1000)
      found.push({ start: match.index, end: match.index + match[0].length, part: { slow: true } });
  }
  found.sort((a, b) => a.start - b.start);
  const parts: MessagePart[] = [];
  let at = 0;
  for (const each of found) {
    if (each.start < at) continue;
    if (each.start > at) parts.push({ text: message.slice(at, each.start) });
    parts.push({ text: message.slice(each.start, each.end), ...each.part });
    at = each.end;
  }
  if (at < message.length) parts.push({ text: message.slice(at) });
  return parts;
}
