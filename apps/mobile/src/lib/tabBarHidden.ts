/** The screens under Agents with a bar pinned where the floating tab bar would sit. */
const BAR_SCREENS = new Set(['[id]', 'diff', 'quote']);

/**
 * Whether the tab bar hides for the route `segments` (expo-router's useSegments): on a session's
 * screen (its reply bar) and on a diff or a quote (their note form), as Messages hides it in a chat.
 */
export const tabBarHidden = (segments: readonly string[]) =>
  segments.length === 2 && segments[0] === 'agents' && BAR_SCREENS.has(segments[1] ?? '');
