/** base64 to bytes: how `term://data` events and OSC 52 payloads carry them. */
export const fromBase64 = (base64: string) => Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
