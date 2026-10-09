import { type EvaluateDeps, evaluate } from '../../decisions/evaluate.js';
import type { Faro } from '../../decisions/faro.js';
import { MAX_SOURCES, relevancePacket, type Source } from '../../decisions/packet.js';
import type { DecisionRecorder } from '../../decisions/types.js';
import { VAULT } from '../layout.js';
import { readNote } from '../notes.js';
import { searchVault } from '../search.js';
import type { CaptureItem } from './items.js';

// Which note already covers a captured item (CONTEXT.md, Vault capture): core searches the vault,
// and the Decision model, when the profile has one, picks among the hits at the relevance site.

/**
 * Which of `sources` covers `query`, asked of the Decision model, its decision recorded on
 * `recorder`: a source's id, `null` when it answers none, undefined when it gives no answer (no
 * model, an abstention, a failure).
 */
export type CoverJudge = (
  query: string,
  sources: Source[],
  recorder: DecisionRecorder,
) => Promise<string | null | undefined>;

/** The relevance judge over Faro: an on-demand evaluation, accepted or no answer. */
export function relevanceJudge(deps: {
  faro: Pick<Faro, 'ask'>;
  /** The profile's Decision model now, its opt-in to experimental sites, and the clock. */
  settings: () => Pick<EvaluateDeps, 'model' | 'experimental' | 'clock'>;
}): CoverJudge {
  return async (query, sources, recorder) => {
    try {
      const { packet } = relevancePacket(query, sources);
      const evaluation = await evaluate(
        {
          ...deps.settings(),
          ask: (state, questions, deadlineMs, options) =>
            deps.faro.ask(state, questions, deadlineMs, { ...options, recorder }),
        },
        packet,
        { mode: 'on-demand' },
      );
      if (evaluation.status !== 'accepted') return undefined;
      return evaluation.answer === 'none' ? null : String(evaluation.answer);
    } catch {
      return undefined;
    }
  };
}

/** A candidate note: its path, its title (its heading, else its file name), and its text. */
type Candidate = Source & { path: string };

/** Words of a title worth searching for: 4 characters or more, at most 8. */
const searchWords = (title: string) =>
  [...new Set(title.toLocaleLowerCase().match(/[\p{L}\p{N}]{4,}/gu) ?? [])].slice(0, 8);

/**
 * `project`'s notes of the item's type (`decision` or `note`) under wiki/ with a word of its
 * title in them, those with the most words first, at most MAX_SOURCES. Only notes Mesa wrote and
 * nobody locked: a person's note is never one a capture updates.
 */
function candidates(vault: string, project: string, item: CaptureItem): Candidate[] {
  const words = searchWords(item.title);
  const counts = new Map<string, number>();
  for (const word of words.length ? words : [item.title]) {
    for (const hit of searchVault(vault, word, { project, type: VAULT.wiki }).items) {
      if (hit.kind === 'markdown') counts.set(hit.path, (counts.get(hit.path) ?? 0) + 1);
    }
  }
  return [...counts]
    .sort((a, b) => b[1] - a[1])
    .flatMap(([path]): Candidate[] => {
      const { frontmatter, body } = readNote(vault, path);
      if (frontmatter.type !== item.kind || frontmatter.source !== 'mesa' || frontmatter.locked)
        return [];
      const heading = /^# (.+)$/m.exec(body)?.[1]?.trim();
      const title = heading ?? path.slice(path.lastIndexOf('/') + 1, -'.md'.length);
      const excerpt = body.replace(/^# .+$/m, '').trim();
      return [{ id: `note:${path}`, path, title, excerpt }];
    })
    .slice(0, MAX_SOURCES);
}

/**
 * The note that already covers `item` in `project`, if any: among the candidates, the one the
 * Decision model picks (`judge`); with no answer from it, only a note of exactly the same title.
 */
export async function coveringNote(
  deps: { vault: string; judge: CoverJudge; recorder: DecisionRecorder },
  project: string,
  item: CaptureItem,
): Promise<string | undefined> {
  const found = candidates(deps.vault, project, item);
  if (!found.length) return undefined;
  const said = item.kind === 'decision' ? item.decision : item.body;
  const picked = await deps.judge(`${item.title}: ${said}`, found, deps.recorder);
  if (picked !== undefined) return found.find((c) => c.id === picked)?.path;
  const title = item.title.toLocaleLowerCase();
  return found.find((c) => c.title.toLocaleLowerCase() === title)?.path;
}
