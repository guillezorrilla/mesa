/** The screens with a bar pinned where the floating tab bar would sit, by route. */
const BAR_SCREENS = new Set(['agents/[id]', 'agents/diff', 'agents/quote', 'vault/decide']);

/**
 * Whether the tab bar hides for the route `segments` (expo-router's useSegments): on a session's
 * screen (its reply bar), on a diff or a quote (their note form) and on saving a decision (its Save
 * bar), as Messages hides it in a chat.
 */
export const tabBarHidden = (segments: readonly string[]) => BAR_SCREENS.has(segments.join('/'));
