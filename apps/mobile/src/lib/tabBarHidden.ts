/**
 * Whether the tab bar hides for the route `segments` (expo-router's useSegments): on a session's
 * screen and the new session form, whose bars sit where the floating tab bar would, as Messages
 * hides it in a chat.
 */
export const tabBarHidden = (segments: readonly string[]) =>
  segments.length === 2 &&
  segments[0] === 'agents' &&
  ['[id]', 'start'].includes(segments[1] ?? '');
