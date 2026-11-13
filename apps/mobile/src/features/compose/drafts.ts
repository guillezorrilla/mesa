import { File, Paths } from 'expo-file-system';
import { appended, type Drafts, parseDrafts, withDraft } from './draftMap';

// Each session's unsent reply, kept in the app's documents so it survives leaving the screen and
// relaunching the app. Any screen may add to one (a quote from #1063: appendDraft); the composer
// shows the change at once (subscribeDrafts).

const file = new File(Paths.document, 'drafts.json');
let drafts: Drafts = file.exists ? parseDrafts(file.textSync()) : {};
const listeners = new Set<() => void>();

/** Session `id`'s draft, empty when none. */
export const draftOf = (id: string) => drafts[id] ?? '';

export function setDraft(id: string, text: string) {
  drafts = withDraft(drafts, id, text);
  for (const listener of listeners) listener();
  // ponytail: the whole file on each keystroke; a few KB, so a debounce only if typing lags.
  if (!file.exists) file.create();
  file.writeSync(JSON.stringify(drafts));
}

/** Adds `text` to session `id`'s draft as its own paragraph. */
export const appendDraft = (id: string, text: string) => setDraft(id, appended(draftOf(id), text));

export function subscribeDrafts(listener: () => void) {
  listeners.add(listener);
  return () => void listeners.delete(listener);
}
