import { router } from 'expo-router';

/** Opens one vault item in the reader, over the screen it was tapped on. */
export const openNote = (path: string) =>
  router.push({ pathname: '/vault/note', params: { path } });
