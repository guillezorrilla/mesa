import { AGENTS } from '../../agents/agents.js';
import type { TranscriptMessage } from '../../agents/transcripts.js';
import type { MesaContext } from '../../context.js';
import { clip } from '../../lib/clip.js';
import { redactWhole } from '../../lib/redact.js';
import type { SessionRecord } from '../../sessions/record/record.js';

// What a Vault capture's run reads on stdin (CONTEXT.md, Vault capture): which session it is,
// then the messages of its conversation newer than its last capture's mark (`through`).

// ponytail: the newest 100,000 characters of a conversation, some 25k tokens; a capture of a
// longer one reads its end, where its settled decisions usually are. Chunk it if that misses some.
/** How much of a session's conversation a vault-capture run about it is given. */
const CONVERSATION_CHARS = 100_000;

/** A capture run's stdin, and the time of the newest message in it, when its messages carry one. */
export type CaptureInput = { text: string; upTo?: string };

/** When message `m` was written, epoch ms; none when its transcript gave no readable time. */
const timeOf = (m: TranscriptMessage) => {
  const at = m.at === undefined ? Number.NaN : Date.parse(m.at);
  return Number.isNaN(at) ? undefined : at;
};

/**
 * The messages in `about`'s native transcript written after `through` (all of them when there is
 * none), oldest first; none without a transcript on this machine.
 */
function newMessages(
  where: Pick<MesaContext, 'home' | 'env'>,
  about: SessionRecord,
  through: string | undefined,
) {
  if (about.agent === 'terminal' || !about.agentSessionId) return [];
  const transcripts = AGENTS[about.agent].transcripts;
  const file = transcripts?.file(where, about.agentSessionId);
  if (!transcripts || !file) return [];
  const { messages } = transcripts.messages(file);
  if (through === undefined) return messages;
  const mark = Date.parse(through);
  // A message with no time cannot be placed after a mark, so it is new only before the first one.
  return messages.filter((m) => (timeOf(m) ?? mark) > mark);
}

/**
 * What a vault-capture run about `about` reads on stdin: which session it is and its goal, then
 * its messages newer than `through`, each `[user] <text>` or `[assistant] <text>`, the newest
 * that fit in CONVERSATION_CHARS, the newest alone clipped to it (ending `...`) when it does not
 * fit whole, redacted as they leave Mesa; `upTo`, the newest time among them, is the mark it
 * leaves once it lands. None when no message is newer, or no transcript is on this machine.
 */
export function captureInput(
  deps: Pick<MesaContext, 'home' | 'env' | 'secrets'>,
  about: SessionRecord,
  through?: string,
): CaptureInput | undefined {
  const lines: string[] = [];
  let newest: number | undefined;
  let room = CONVERSATION_CHARS;
  for (const message of newMessages(deps, about, through).reverse()) {
    const line = `[${message.role}] ${message.text.trim()}`;
    const fits = line.length <= room;
    if (!fits && lines.length) break;
    lines.unshift(fits ? line : clip(line, room));
    const at = timeOf(message);
    if (at !== undefined && (newest === undefined || at > newest)) newest = at;
    if (!fits) break;
    room -= line.length + 1;
  }
  if (!lines.length) return undefined;
  const ended = about.endedAt ? `, ended ${about.endedAt}` : '';
  const head = [
    `Mesa session ${about.id} on ${about.project}, started ${about.startedAt}${ended}.`,
    ...(about.goal ? [`Its goal: ${about.goal}`] : []),
    through
      ? `Its conversation since its last capture, the newest ${lines.length} messages:`
      : `Its conversation, the newest ${lines.length} messages:`,
  ];
  const text = redactWhole([...head, '', ...lines, ''].join('\n'), deps.home, deps.secrets());
  return { text, ...(newest === undefined ? {} : { upTo: new Date(newest).toISOString() }) };
}
