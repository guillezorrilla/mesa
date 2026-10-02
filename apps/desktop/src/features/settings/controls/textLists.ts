/** Comma-separated words, kept in order, blanks dropped. */
export const commaList = (text: string) => ({
  value: text
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean),
});

/** One entry per line, blanks dropped. */
export const lineList = (text: string) => ({
  value: text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean),
});
