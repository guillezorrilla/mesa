// The broker's random ids and tokens, and the hash it keeps of a token instead of the token.

const encoder = new TextEncoder();

/** SHA-256 of a text, as hex. */
export async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** `bytes` random bytes, base64url: a pairing id (16) or a token (32). */
export function randomToken(bytes = 32) {
  const random = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...random))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
}
