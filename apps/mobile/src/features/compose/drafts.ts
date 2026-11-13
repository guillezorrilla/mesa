import { fileStore } from '@/lib/fileStore';
import { appended, parseDrafts, withDraft } from './draftMap';

// Each session's unsent reply, kept in the app's documents so it survives leaving the screen and
// relaunching the app. Any screen may add to one (a quote from #1063: appendDraft); the composer
// shows the change at once (subscribeDrafts).

// ponytail: the whole file on each keystroke; a few KB, so a debounce only if typing lags.
const drafts = fileStore('drafts.json', parseDrafts, {});

/** Session `id`'s draft, empty when none. */
export const draftOf = (id: string) => drafts.get()[id] ?? '';

export const setDraft = (id: string, text: string) => drafts.set(withDraft(drafts.get(), id, text));

/** Adds `text` to session `id`'s draft as its own paragraph. */
export const appendDraft = (id: string, text: string) => setDraft(id, appended(draftOf(id), text));

export const subscribeDrafts = drafts.subscribe;
