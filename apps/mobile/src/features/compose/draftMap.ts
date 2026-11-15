// The drafts' pure rules, apart from the file that keeps them (drafts.ts).
import { parseStringMap } from '../../lib/stringMap';

/** Each session's unsent reply, by session id. */
export type Drafts = Record<string, string>;

/** The drafts with session `id`'s set to `text`; a blank one is dropped, so only typed text is kept. */
export function withDraft(drafts: Drafts, id: string, text: string): Drafts {
  const { [id]: _, ...rest } = drafts;
  return text.trim() ? { ...rest, [id]: text } : rest;
}

/** `text` added to a draft as its own paragraph, as a saved prompt or a quote lands under what was typed. */
export const appended = (draft: string, text: string) =>
  draft.trim() ? `${draft.trimEnd()}\n\n${text}` : text;

/** Drafts read back from their file; anything else (a broken file) is none. */
export const parseDrafts: (json: string) => Drafts = parseStringMap;
