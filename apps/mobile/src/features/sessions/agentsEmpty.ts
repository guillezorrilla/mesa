/**
 * What the Agents tab says with no row to show: none matching the search (named) or the chips,
 * or no session on the Mac (or Macs) at all.
 */
export function agentsEmpty(listed: number, query: string, several: boolean) {
  const where = several ? 'your Macs' : 'your Mac';
  if (!listed)
    return {
      title: 'No sessions yet',
      line: `Sessions on ${where} show here. Start one with +.`,
    };
  const asked = query.trim();
  return {
    title: asked ? `No session matches "${asked}"` : 'No session matches',
    line: asked
      ? 'Search reads titles, projects and what a session asks.'
      : 'Clear a chip to see more.',
  };
}
