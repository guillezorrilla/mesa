// A courier's manifest, read over HTTP.

/** The manifest at `url` as parsed JSON, fetched with `fetch` (the global one unless given). */
export async function fetchManifest(url, { fetch = globalThis.fetch } = {}) {
  let last;
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    last = response.status;
  }
  throw new Error(`manifest fetch failed: HTTP ${last}`);
}
