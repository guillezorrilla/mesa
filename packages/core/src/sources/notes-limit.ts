// Measured (#400): an item's Write notes argument, `<snapshot>=<note>`, is up to some 210 bytes (a
// web page's 80-character slug in both paths) and the rest of the run's command some 300, so 55
// items fit the 12000 bytes Mesa passes to tmux (requireCommandFits) and 60 do not. One run
// returning dozens of notes is long too.
/** How many items one import with Write notes takes (import-notes.ts); the Picker says so too. */
export const NOTES_MAX_ITEMS = 50;
