/** How many lane colours the graph cycles through (the theme's `--series-1` to `--series-8`). */
export const LANE_COLORS = 8;

export type LaneCommit = { oid: string; parents: string[] };
/** A commit's place: its column and the index of its lane colour. */
export type LaneRow = { column: number; color: number };
/** A line from a commit down to one of its parents, both rows in the list. */
export type LaneEdge = {
  fromRow: number;
  fromColumn: number;
  toRow: number;
  toColumn: number;
  color: number;
};

/**
 * Lane columns for commits in topological order, newest first: a commit takes the lane its
 * child reserved for it, its first parent continues that lane (moving left onto it when a
 * branch reserved it further right), and each other parent opens the first free one.
 */
export function graphLanes(commits: LaneCommit[]) {
  const lanes: (string | undefined)[] = [];
  const colorOf = new Map<string, number>();
  const rowOf = new Map(commits.map((commit, row) => [commit.oid, row]));
  let nextColor = 0;
  const newColor = () => nextColor++ % LANE_COLORS;
  const free = () => {
    const open = lanes.indexOf(undefined);
    return open === -1 ? lanes.length : open;
  };
  const rows: LaneRow[] = [];
  const links: Pick<LaneEdge, 'fromRow' | 'fromColumn' | 'toRow'>[] = [];
  commits.forEach((commit, row) => {
    // A line that ran down a lane to this commit has arrived; its lane opens again.
    lanes.forEach((lane, at) => {
      if (lane === `line:${commit.oid}`) lanes[at] = undefined;
    });
    let column = lanes.indexOf(commit.oid);
    if (column === -1) column = free();
    const color = colorOf.get(commit.oid) ?? newColor();
    lanes[column] = undefined;
    commit.parents.forEach((parent, index) => {
      const reserved = lanes.indexOf(parent);
      if (index === 0 && reserved > column) {
        // The first parent moves left onto this lane, so a trunk keeps its column; the line
        // already headed to it keeps the old lane until it arrives.
        lanes[reserved] = `line:${parent}`;
        lanes[column] = parent;
        colorOf.set(parent, color);
      } else if (reserved === -1) {
        lanes[index === 0 ? column : free()] = parent;
        if (!colorOf.has(parent)) colorOf.set(parent, index === 0 ? color : newColor());
      }
      const toRow = rowOf.get(parent);
      // ponytail: a parent past the commit limit has no row, so its line is not drawn.
      if (toRow !== undefined && toRow > row)
        links.push({ fromRow: row, fromColumn: column, toRow });
    });
    rows.push({ column, color });
  });
  // A line ends where its parent finally sits, in the colour of the lane it runs down.
  const edges: LaneEdge[] = links.map((link) => {
    const to = rows[link.toRow] ?? { column: link.fromColumn, color: 0 };
    const from = rows[link.fromRow] ?? to;
    return { ...link, toColumn: to.column, color: (from.column > to.column ? from : to).color };
  });
  return { rows, edges, columns: Math.max(0, ...rows.map((row) => row.column)) + 1 };
}
