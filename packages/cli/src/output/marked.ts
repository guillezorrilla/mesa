/** A session's read mark, as `mesa read` and `mesa unread` print it. */
export type Mark = { id: string; unread: boolean };

/** What a read or unread mark prints: the one session's mark, or each one's when several. */
export function markedOutput(records: readonly { id: string }[], unread: boolean) {
  const marks: Mark[] = records.map(({ id }) => ({ id, unread }));
  const several = marks.length > 1;
  return {
    data: several ? marks : marks[0],
    text: `${marks.map((m) => m.id).join(', ')} ${several ? 'are' : 'is'} ${unread ? 'unread' : 'read'}`,
  };
}
