// What the Files screen says for a row of a folder and for a search hit.

/** A folder row's words: '..' is the way up. */
export const entryLabel = (row: { name: string; dir: boolean }) =>
  row.name === '..' ? 'Up one folder' : `${row.name}${row.dir ? ', folder' : ''}`;

/** Where a search hit is: its path, and its line when it is in the text. */
export const hitPlace = (hit: { path: string; line: number }) =>
  hit.line ? `${hit.path}:${hit.line}` : hit.path;
