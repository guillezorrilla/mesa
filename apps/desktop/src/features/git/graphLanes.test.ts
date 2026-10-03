import { expect, test } from 'vitest';
import { graphLanes } from './graphLanes';

test('a straight history keeps one lane and one colour', () => {
  const { rows, edges, columns } = graphLanes([
    { oid: 'c', parents: ['b'] },
    { oid: 'b', parents: ['a'] },
    { oid: 'a', parents: [] },
  ]);
  expect(columns).toBe(1);
  expect(rows).toEqual([
    { column: 0, color: 0 },
    { column: 0, color: 0 },
    { column: 0, color: 0 },
  ]);
  expect(edges.map((edge) => [edge.fromRow, edge.toRow])).toEqual([
    [0, 1],
    [1, 2],
  ]);
});

test('a merged branch runs in a second lane of its own colour and rejoins the first', () => {
  // merge <- main work, feature 2 <- feature 1; both sides start from base.
  const { rows, edges, columns } = graphLanes([
    { oid: 'merge', parents: ['main', 'f2'] },
    { oid: 'f2', parents: ['f1'] },
    { oid: 'f1', parents: ['base'] },
    { oid: 'main', parents: ['base'] },
    { oid: 'base', parents: [] },
  ]);
  expect(columns).toBe(2);
  expect(rows.map((row) => row.column)).toEqual([0, 1, 1, 0, 0]);
  expect(rows[1]?.color).not.toBe(rows[0]?.color);
  expect(rows[3]?.color).toBe(rows[0]?.color);
  expect(rows.map((row) => row.color)).toEqual([0, 1, 1, 0, 0]);
  // f1 rejoins the first lane in the branch colour.
  expect(edges).toContainEqual({ fromRow: 2, fromColumn: 1, toRow: 4, toColumn: 0, color: 1 });
});

test('a parent past the commit limit draws no line', () => {
  expect(graphLanes([{ oid: 'b', parents: ['beyond'] }]).edges).toEqual([]);
});

test('a line still running to its parent keeps its lane, so no other branch draws over it', () => {
  // Two merged branches, as `git log --topo-order` lists them: beacon starts from harbor,
  // tide from base, and beacon's line passes tide's commits on its way down.
  const { rows, edges } = graphLanes([
    { oid: 'release', parents: ['merge-beacon'] },
    { oid: 'merge-beacon', parents: ['roster', 'beacon'] },
    { oid: 'beacon', parents: ['harbor'] },
    { oid: 'roster', parents: ['merge-tide'] },
    { oid: 'merge-tide', parents: ['harbor', 'tide'] },
    { oid: 'tide', parents: ['base'] },
    { oid: 'harbor', parents: ['base'] },
    { oid: 'base', parents: [] },
  ]);
  expect(rows.map((row) => row.column)).toEqual([0, 0, 1, 0, 0, 2, 0, 0]);
  expect(edges).toContainEqual(expect.objectContaining({ fromRow: 2, fromColumn: 1, toRow: 6 }));
});
