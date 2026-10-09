import { clip } from '../lib/clip.js';
import { MesaError } from '../lib/result.js';
import type { DecisionSite } from './sites.js';
import type { Question } from './types.js';

// What a decision site sends a model (ADR-0019): the state, in exactly the shape the sites were
// qualified on (decisions/evaluation/corpus/), and its one question. Mesa builds every packet from
// fixed fields and caps it, so a packet never grows with the vault or with what a caller sends.

/** The most characters a packet's state holds: about 1,024 tokens at about 4 characters a token. */
export const PACKET_CHARS = 4096;
/** The most characters of a query, goal or claim; of a candidate's excerpt; of one listed line. */
const CHARS = { head: 300, excerpt: 200, line: 300, title: 100 };
/** The most relevance candidates (ADR-0019 measured 10 at 200 characters inside the deadline). */
export const MAX_SOURCES = 10;
/** The most next-step candidates, events and attempts. */
export const MAX_STEPS = 8;
export const MAX_EVENTS = 5;

/** A site's state and question, as sent. */
export type Packet = { site: DecisionSite; state: string; question: Question };

/** A vault source as relevance offers it: `note:<path>`, its title and the start of its text. */
export type Source = { id: string; title: string; excerpt: string };
/** A step a caller offers next-step: a short slug and what it does. */
export type Step = { id: string; step: string };

/** A step's id: a short lowercase slug, so an id can carry no instructions of its own. */
export const STEP_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

/** `text` on one line: every run of whitespace a single space. */
const flat = (text: string) => text.replace(/\s+/g, ' ').trim();

/** `lines` under `head`, as many whole ones, in order, as fit in `room` characters. */
function fitted(head: string, lines: readonly string[], room: number) {
  const kept: string[] = [];
  let used = head.length;
  for (const line of lines) {
    if (used + line.length + 1 > room) break;
    kept.push(line);
    used += line.length + 1;
  }
  return kept;
}

/**
 * The newest of `items` as a bulleted section, as many as fit in `room` characters, oldest first;
 * `- none` when there are none, as the corpus writes it.
 */
function bullets(items: readonly string[], room: number) {
  const lines = items.slice(-MAX_EVENTS).map((i) => `- ${clip(flat(i), CHARS.line)}`);
  const kept = fitted('', [...lines].reverse(), room).reverse();
  return kept.length ? kept.join('\n') : '- none';
}

/** `source` as a relevance packet sends it: its title and excerpt on one line, capped. */
export const sentSource = (source: Source): Source => ({
  id: source.id,
  title: clip(flat(source.title), CHARS.title),
  excerpt: clip(flat(source.excerpt), CHARS.excerpt),
});

/**
 * The relevance packet: `query`, then each source that fits as `[id] title: excerpt`, in the
 * order given, with the sources as sent (sentSource); the Choice is between them and `none`.
 */
export function relevancePacket(query: string, sources: readonly Source[]) {
  const head = `Query: ${clip(flat(query), CHARS.head)}\nCandidates:\n`;
  const capped = sources.slice(0, MAX_SOURCES).map(sentSource);
  const lines = capped.map((s) => `[${s.id}] ${s.title}: ${s.excerpt}`);
  const sent = capped.slice(0, fitted(head, lines, PACKET_CHARS).length);
  const packet: Packet = {
    site: 'relevance',
    state: `${head}${lines.slice(0, sent.length).join('\n')}`,
    question: { kind: 'Choice', id: 'source', options: [...sent.map((s) => s.id), 'none'] },
  };
  return { packet, sent };
}

/**
 * The next-step packet: the saved goal, the current events and attempts, and the candidate steps;
 * the Choice is between the steps and `defer`. Ids are slugs, unique, and never `defer`.
 */
export function nextStepPacket(input: {
  goal: string;
  events: readonly string[];
  attempts: readonly string[];
  candidates: readonly Step[];
}): Packet {
  const { candidates } = input;
  if (!candidates.length || candidates.length > MAX_STEPS)
    throw new MesaError('usage', `next-step needs 1 to ${MAX_STEPS} candidates`);
  const ids = candidates.map((c) => c.id);
  const bad = ids.find((id) => !STEP_ID.test(id) || id === 'defer');
  if (bad !== undefined)
    throw new MesaError('usage', `candidate id ${JSON.stringify(bad)} is not a short slug`);
  if (new Set(ids).size !== ids.length) throw new MesaError('usage', 'candidate ids repeat');
  const steps = candidates.map((c) => `- ${c.id}: ${clip(flat(c.step), CHARS.line)}`).join('\n');
  const head = `Goal: ${clip(flat(input.goal), CHARS.head)}\n`;
  const tail = `\nCandidates:\n${steps}`;
  // Events and attempts share what the steps leave, the oldest going first: 8 steps at their caps
  // leave about 900 characters.
  const room =
    PACKET_CHARS - head.length - tail.length - '\nRecent events:\nAttempts so far:'.length;
  return {
    site: 'next-step',
    state: `${head}Recent events:\n${bullets(input.events, room / 2)}\nAttempts so far:\n${bullets(input.attempts, room / 2)}${tail}`,
    question: { kind: 'Choice', id: 'next', options: [...ids, 'defer'] },
  };
}

/** The evidence packet: the claim, then as much of the evidence as fits, from its start. */
export function evidencePacket(claim: string, evidence: string): Packet {
  if (!claim.trim() || !evidence.trim())
    throw new MesaError('usage', 'evidence needs a claim and the evidence for it');
  const head = `Claim: ${clip(flat(claim), CHARS.head)}\nEvidence:\n`;
  return {
    site: 'evidence',
    state: `${head}${clip(evidence.trim(), PACKET_CHARS - head.length)}`,
    question: {
      kind: 'Noul',
      id: 'supported',
      statement: 'The evidence supports the completion claim',
    },
  };
}
