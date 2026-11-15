/** A map of strings read back from its file; anything else (a broken file) is empty. */
export function parseStringMap(json: string): Record<string, string> {
  try {
    const value: unknown = JSON.parse(json);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(
      Object.entries(value).filter(
        (entry): entry is [string, string] => typeof entry[1] === 'string',
      ),
    );
  } catch {
    return {};
  }
}
