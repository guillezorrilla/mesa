import { isSessionId } from '../record/id.js';

/** Profile-qualified navigation to a saved session; RFC 3986 encodes each component. */
export function sessionUri(id: string, profile: string): string {
  const component = (value: string) =>
    encodeURIComponent(value).replace(
      /[!'()*]/g,
      (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
    );
  return `mesa://session/${component(id)}?profile=${component(profile)}`;
}

const hasControl = (value: string) =>
  [...value].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });

/** An exact session destination, or null for malformed/other links; never selects a profile. */
export function parseSessionUri(value: string): { id: string; profile?: string } | null {
  if (hasControl(value)) return null;
  try {
    const url = new URL(value);
    if (
      url.protocol !== 'mesa:' ||
      url.hostname !== 'session' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      !url.pathname.startsWith('/') ||
      [...url.searchParams.keys()].some((key) => key !== 'profile') ||
      url.searchParams.getAll('profile').length > 1
    )
      return null;
    const path = value.match(/^mesa:\/\/session(\/[^?#]*)/)?.[1];
    const id = decodeURIComponent(path?.slice(1) ?? '');
    if (!isSessionId(id)) return null;
    // URLSearchParams replaces broken UTF-8; validate the original query before reading it.
    decodeURIComponent(url.search.replaceAll('+', ' '));
    const profile = url.searchParams.get('profile');
    if (profile !== null && (!profile.trim() || hasControl(profile))) return null;
    return { id, ...(profile !== null ? { profile } : {}) };
  } catch {
    return null;
  }
}
