// The broker's random ids and tokens, and the hash it keeps of a token instead of the token.

const encoder = new TextEncoder();

/** SHA-256 of a text, as hex. */
export async function sha256(text: string) {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(text)));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

/** Bytes, or a text's characters as bytes, in unpadded base64url. */
export const base64url = (bytes: Uint8Array | string) =>
  btoa(typeof bytes === 'string' ? bytes : String.fromCharCode(...bytes))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');

/** `bytes` random bytes, base64url: a pairing id (16) or a token (32). */
export const randomToken = (bytes = 32) => base64url(crypto.getRandomValues(new Uint8Array(bytes)));
