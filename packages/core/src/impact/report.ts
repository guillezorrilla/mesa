import type { AgentState } from '../agents/states.js';
import type { LogEntry } from '../decisions/log.js';
import { counted } from '../lib/format.js';
import type { ReceiptEntry } from '../receipts/store.js';
import { type SessionState, WAITING_STATES } from '../sessions/record/states.js';

// Impact (CONTEXT.md): what Mesa decided and kept for a person, as Moments per session, from the
// Decision log and the vault's receipts. Outcomes are facts read afterwards, never estimates. Pure:
// impact/service.ts gathers what it reads.

/** What happened after a Moment, when Mesa can tell. */
export type Outcome =
  | { kind: 'hook-agreed' | 'hook-disagreed' | 'overridden' | 'not-overridden'; text: string }
  | { kind: 'answered'; minutes: number; text: string };

/** One thing Mesa did for a session that changed something (CONTEXT.md, Moment). */
export type Moment = {
  id: string;
  at: string;
  site: LogEntry['site'] | 'vault';
  /** The question in plain words. */
  question: string;
  /** What Mesa did, in a few words. */
  title: string;
  by: LogEntry['by'];
  /** The probability of the answer that stood, when one was given. */
  confidence?: number;
  /** What the rules alone would have said, when it differs. */
  rulesAlone?: string;
  /** The vault notes it brought in or kept. */
  notes?: string[];
  outcome: Outcome | null;
};

/** The log lines of a session that changed nothing: one quiet count each. */
export type Folded = { agreed: number; unsure: number; failed: number; skipped: number };

export type SessionImpact = {
  /** The Mesa session; null for guarded actions outside one (a push from the Git tab). */
  id: string | null;
  name: string;
  project: string | null;
  /** Oldest first: the session's thread. */
  moments: Moment[];
  folded: Folded;
  /** The model whose agreements `folded` counts, when one was asked. */
  model?: LogEntry['by'];
};

export type ImpactSummary = {
  /** Sessions the model saw waiting on the person when the rules did not. */
  caught: number;
  /** Other session states the model corrected. */
  corrected: number;
  notesIn: number;
  stopped: number;
  kept: number;
  /** Sessions with at least one Moment. */
  sessions: number;
};

export type ImpactReport = {
  days: number;
  since: string;
  project?: string;
  session?: string;
  summary: ImpactSummary;
  /** The summary as one sentence, or the empty state's words. */
  sentence: string;
  /** Newest activity first. */
  sessions: SessionImpact[];
};

/** A session record as Impact reads it: its name, project, when a person spoke to it, and its hooks. */
export type ImpactRecord = {
  id: string;
  name: string;
  project: string;
  prompts: string[];
  /** The states its hooks reported, oldest first. */
  hookStates: { at: string; state: string }[];
};

/** Who answered, in a person's words. */
export const DECIDERS: Record<LogEntry['by'], string> = {
  rules: 'Rules',
  jev: 'Jev',
  clef: 'CLEF',
};

/** Who answered a Moment, and how sure, as a row shows it. */
export const answeredBy = (m: Moment) =>
  `${DECIDERS[m.by]}${m.confidence === undefined ? '' : ` ${Math.round(m.confidence * 100)}%`}`;

/** What a Moment with no outcome says. */
export const NO_OUTCOME = 'No outcome yet';

export const EMPTY_IMPACT =
  'Nothing yet. Moments appear when Mesa catches a question, brings a note in, stops a command or keeps a note.';

/** A state the model placed, in a person's words. */
const STATE_WORDS: Record<AgentState, string> = {
  'waiting-question': 'waiting on your answer',
  'waiting-permission': 'waiting for your permission',
  working: 'working',
  idle: 'idle',
  done: 'done',
  failed: 'failed',
};
const words = (state: string | null) =>
  (state && STATE_WORDS[state as AgentState]) ?? state ?? 'unknown';
const waiting = (state: string | null) => WAITING_STATES.has(state as SessionState);

/** Which quiet count a line that changed nothing adds to. */
const FOLDED: Record<LogEntry['status'], keyof Folded> = {
  accepted: 'agreed',
  abstained: 'unsure',
  unavailable: 'failed',
  skipped: 'skipped',
  blocked: 'agreed',
  overridden: 'agreed',
};

/** How long after a placement a hook still counts as its check. */
const HOOK_WINDOW_MS = 10 * 60_000;

/** A placement's outcome: the person's next prompt after a wait, else the next hook's state. */
function placementOutcome(entry: LogEntry, record: ImpactRecord | undefined): Outcome | null {
  if (waiting(entry.answer)) {
    const next = record?.prompts.find((at) => at > entry.at);
    if (!next) return null;
    const minutes = Math.max(0, Math.round((Date.parse(next) - Date.parse(entry.at)) / 60_000));
    return { kind: 'answered', minutes, text: `You answered ${minutes} min later` };
  }
  const limit = Date.parse(entry.at) + HOOK_WINDOW_MS;
  const hook = record?.hookStates.find((h) => h.at > entry.at && Date.parse(h.at) <= limit);
  if (!hook) return null;
  return hook.state === entry.answer
    ? { kind: 'hook-agreed', text: 'A hook agreed later' }
    : { kind: 'hook-disagreed', text: `A hook said ${words(hook.state)} later` };
}

/** A log line's Moment, and the summary count it adds to. */
function logMoment(
  entry: LogEntry,
  record: ImpactRecord | undefined,
): [Moment, keyof ImpactSummary] {
  const confidence = entry.answer ? entry.probabilities?.[entry.answer] : undefined;
  const base = {
    id: entry.id,
    at: entry.at,
    site: entry.site,
    question: entry.question,
    by: entry.by,
    ...(confidence === undefined ? {} : { confidence }),
  };
  if (entry.site === 'supervision')
    return [
      {
        ...base,
        title: `Saw it was ${words(entry.answer)}`,
        ...(entry.rules && entry.rules !== entry.answer ? { rulesAlone: entry.rules } : {}),
        outcome: placementOutcome(entry, record),
      },
      waiting(entry.answer) ? 'caught' : 'corrected',
    ];
  if (entry.site === 'relevance')
    return [
      {
        ...base,
        title: `Brought ${entry.note} into the prompt`,
        ...(entry.note ? { notes: [entry.note] } : {}),
        outcome: null,
      },
      'notesIn',
    ];
  // Stopped either way: an override is a person going ahead after the guardrail held it.
  const overridden = entry.status === 'overridden';
  const moment: Moment = {
    ...base,
    title: `${entry.answer === 'block' ? 'Stopped' : 'Asked first'}: ${entry.reason ?? 'the guardrail'}`,
    outcome: overridden
      ? { kind: 'overridden', text: `You went ahead (${entry.override})` }
      : { kind: 'not-overridden', text: 'You did not override it' },
  };
  return [moment, 'stopped'];
}

/** A receipt that wrote the vault for a session: its notes, else none. */
function writtenNotes({ receipt }: ReceiptEntry): string[] {
  if (receipt.status !== 'ok') return [];
  const { notes, target } = receipt.outputs as { notes?: unknown; target?: unknown };
  if (receipt.kind === 'capture') return Array.isArray(notes) ? notes.map(String) : [];
  return (receipt.kind === 'vault-change' || receipt.kind === 'decision') &&
    typeof target === 'string'
    ? [target]
    : [];
}

function vaultMoment(entry: ReceiptEntry, notes: string[]): Moment {
  const capture = entry.receipt.kind === 'capture';
  return {
    id: entry.receipt.id,
    at: entry.receipt.started,
    site: 'vault',
    question: 'What should the vault keep from this session?',
    title: capture ? `Kept ${counted(notes.length, 'note')} when it ended` : `Saved ${notes[0]}`,
    by: 'rules',
    notes,
    outcome: null,
  };
}

/** The summary as one sentence: only what happened, joined as a person would say it. */
export function impactSentence(s: ImpactSummary, days: number, project?: string): string {
  const parts = [
    s.caught && `caught ${counted(s.caught, 'question')} the rules missed`,
    s.corrected && `corrected ${counted(s.corrected, 'session state')}`,
    s.notesIn && `brought ${counted(s.notesIn, 'vault note')} into prompts`,
    s.stopped && `stopped ${counted(s.stopped, 'risky command')}`,
    s.kept && `kept ${counted(s.kept, 'note')}`,
  ].filter((p): p is string => Boolean(p));
  if (!parts.length) return EMPTY_IMPACT;
  const list =
    parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
  return `In the last ${counted(days, 'day')}${project ? ` in ${project}` : ''}, Mesa ${list}, across ${counted(s.sessions, 'session')}.`;
}

/** The folded line under a session's thread, or none when nothing folded. */
export function foldedText(session: SessionImpact): string | undefined {
  const { agreed, unsure, failed, skipped } = session.folded;
  const model = session.model ? DECIDERS[session.model] : 'the model';
  const parts = [
    agreed && `${counted(agreed, 'check')} where ${model} agreed with the rules`,
    unsure && `${unsure} unsure`,
    failed && `${failed} with no answer`,
    skipped && `${counted(skipped, 'prompt')} with no matching note`,
  ].filter((p): p is string => Boolean(p));
  return parts.length ? `+ ${parts.join(', ')}` : undefined;
}

/**
 * The report over `entries` (the Decision log, already filtered, newest first) and `receipts` (the vault's,
 * already filtered), for the records it names.
 */
export function impactReport(input: {
  days: number;
  since: string;
  project?: string;
  session?: string;
  entries: readonly LogEntry[];
  receipts: readonly ReceiptEntry[];
  records: ReadonlyMap<string, ImpactRecord>;
}): ImpactReport {
  const groups = new Map<string | null, SessionImpact>();
  const group = (id: string | null, project: string | null) => {
    let found = groups.get(id);
    if (!found) {
      const record = id ? input.records.get(id) : undefined;
      found = {
        id,
        name: record?.name ?? id ?? 'Outside a session',
        project: record?.project ?? project,
        moments: [],
        folded: { agreed: 0, unsure: 0, failed: 0, skipped: 0 },
      };
      groups.set(id, found);
    }
    return found;
  };
  const summary: ImpactSummary = {
    caught: 0,
    corrected: 0,
    notesIn: 0,
    stopped: 0,
    kept: 0,
    sessions: 0,
  };
  // The log reads newest first; a thread runs oldest first, ties in the order they were logged.
  for (const entry of [...input.entries].reverse()) {
    const g = group(entry.session, entry.project);
    if (entry.by !== 'rules') g.model = entry.by;
    if (!entry.changed) {
      // A relevance answer that changed nothing found no note to bring: the rules have none here.
      g.folded[
        entry.site === 'relevance' && entry.status === 'accepted' ? 'skipped' : FOLDED[entry.status]
      ] += 1;
      continue;
    }
    const record = entry.session ? input.records.get(entry.session) : undefined;
    const [moment, counts] = logMoment(entry, record);
    g.moments.push(moment);
    summary[counts] += 1;
  }
  for (const receipt of input.receipts) {
    const notes = writtenNotes(receipt);
    if (!notes.length) continue;
    group(receipt.receipt.session ?? null, receipt.receipt.project ?? null).moments.push(
      vaultMoment(receipt, notes),
    );
    summary.kept += notes.length;
  }
  const sessions = [...groups.values()];
  for (const s of sessions) s.moments.sort((a, b) => a.at.localeCompare(b.at));
  summary.sessions = sessions.filter((s) => s.moments.length).length;
  const last = (s: SessionImpact) => s.moments.at(-1)?.at ?? '';
  sessions.sort((a, b) => last(b).localeCompare(last(a)));
  return {
    days: input.days,
    since: input.since,
    ...(input.project ? { project: input.project } : {}),
    ...(input.session ? { session: input.session } : {}),
    summary,
    sentence: impactSentence(summary, input.days, input.project),
    sessions,
  };
}
