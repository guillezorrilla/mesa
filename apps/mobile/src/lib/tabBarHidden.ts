/**
 * Whether the tab bar hides for the route `segments` (expo-router's useSegments): on a session's
 * screen, whose reply bar sits where the floating tab bar would, as Messages hides it in a chat.
 */
export const tabBarHidden = (segments: readonly string[]) =>
  segments.length === 2 && segments[0] === 'agents' && segments[1] === '[id]';
