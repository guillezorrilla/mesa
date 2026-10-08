// A courier's manifest, read over HTTP.

/** The manifest at `url` as parsed JSON, fetched with `fetch` (the global one unless given). */
export async function fetchManifest(_url, { fetch: _fetch = globalThis.fetch } = {}) {
  throw new Error('fetchManifest is not implemented yet');
}
