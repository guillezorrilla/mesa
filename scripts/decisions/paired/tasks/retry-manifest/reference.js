// A courier's manifest, read over HTTP.

/** The manifest at `url` as parsed JSON, fetched with `fetch` (the global one unless given). */
export async function fetchManifest(url, { fetch = globalThis.fetch } = {}) {
  for (let attempt = 1; ; attempt++) {
    const response = await fetch(url);
    if (response.ok) return response.json();
    if (response.status !== 503 || attempt === 4) {
      throw new Error(`manifest fetch failed: HTTP ${response.status}`);
    }
  }
}
