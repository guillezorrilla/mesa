/** The line over a session's changed files: its branch against its base, and how many were viewed. */
export function changesSummary(
  changes: { branch: string | null; base: string; files: unknown[]; omitted: number },
  viewed: number,
) {
  const left = changes.omitted ? `; ${changes.omitted} new files left out` : '';
  return `${changes.branch ?? 'Detached HEAD'} against ${changes.base}, ${viewed} of ${changes.files.length} viewed${left}`;
}
