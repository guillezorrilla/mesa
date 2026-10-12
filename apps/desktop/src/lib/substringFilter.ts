/**
 * A cmdk filter where the typed text must appear in an item's value, not cmdk's fuzzy match
 * ("sev" is not Fix versions, "app" is not area/skills).
 */
export const substringFilter = (value: string, search: string) =>
  value.toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
