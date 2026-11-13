import type { Recorded } from '../../receipts/recorder.js';
import type { NativeHistory } from '../../sessions/native/history.js';
import type { ConversationSearch } from '../../sessions/native/search.js';
import type { SessionRecord } from '../../sessions/record/record.js';
import type { CallResult } from '../protocol/rpc.js';
import type { PhoneConversation } from '../protocol/start.js';

/** The native history functions the CLI uses (`mesa history`, `history search`, `adopt`). */
export type HistoryDeps = {
  /** The projects to look in, by name. */
  projects: () => string[];
  history: (project: string) => NativeHistory;
  search: (project: string, query: string) => ConversationSearch;
  adopt: (
    agentSessionId: string,
    opts: { project: string },
  ) => Promise<Recorded<{ record: SessionRecord }>>;
};

/** How many conversations the phone lists. */
const CONVERSATIONS = 30;

/**
 * The newest native conversations across the projects, or the ones whose text holds `query`,
 * each with the Mesa session it already is. ponytail: reads every project in turn on the Mac,
 * stopping past CONVERSATIONS found; an index if many projects make it slower than the phone's
 * 10 s wait.
 */
export function phoneHistory(deps: HistoryDeps, query?: string) {
  const found: PhoneConversation[] = [];
  let partial = false;
  for (const name of deps.projects()) {
    let listed: NativeHistory;
    let searched: ConversationSearch | undefined;
    try {
      listed = deps.history(name);
      searched = query ? deps.search(name, query) : undefined;
    } catch {
      // A project whose folder is gone lists nothing; the rest still do.
      continue;
    }
    // A hit names no session it is: the project's history does.
    const of = (agent: string, id: string, title: string, at?: string): PhoneConversation => {
      const row = listed.rows.find((r) => r.id === id);
      return {
        project: name,
        agent,
        id,
        title: row?.name ?? title,
        ...(at ? { at } : {}),
        ...(row?.importedAs ? { importedAs: row.importedAs } : {}),
        elsewhere: Boolean(row?.heldElsewhere),
      };
    };
    if (searched) {
      partial ||= searched.truncated;
      for (const hit of searched.hits)
        if (!found.some((f) => f.id === hit.id))
          found.push(of(hit.agent, hit.id, hit.excerpt, hit.at));
    } else {
      partial ||= listed.total > listed.rows.length;
      found.push(
        ...listed.rows.map((r) =>
          of(r.agent, r.id, `Conversation ${r.id.slice(0, 8)}`, r.updatedAt),
        ),
      );
    }
    if (query && found.length > CONVERSATIONS) break;
  }
  // A copy sorted newest first: the app's Hermes has no toSorted, and this module is shared.
  const newest = [...found].sort((a, b) => (b.at ?? '').localeCompare(a.at ?? ''));
  return {
    conversations: newest.slice(0, CONVERSATIONS),
    partial: partial || newest.length > CONVERSATIONS,
  } satisfies CallResult<'history'>;
}
