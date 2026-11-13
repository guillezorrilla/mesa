/** The screens under Agents with a bar pinned where the floating tab bar would sit. */
const BAR_SCREENS = new Set(['[id]', 'diff', 'quote', 'start']);

/**
 * Whether the tab bar hides for the route `segments` (expo-router's useSegments): on a session's
 * screen (its reply bar), on a diff or a quote (their note form) and on the new session form (its
 * Start bar), as Messages hides it in a chat.
 */
export const tabBarHidden = (segments: readonly string[]) =>
  segments.length === 2 && segments[0] === 'agents' && BAR_SCREENS.has(segments[1] ?? '');
