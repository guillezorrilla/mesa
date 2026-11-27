import { expect, test } from 'vitest';
import { managedRow, PROJECTS } from '@/lib/testing';
import { buildingPlan } from './buildingPlan';
import { officeRooms } from './officeLayout';
import { freeCells, pathTo, TILE, walkable } from './officePlan';
import { type Actor, stepActors, syncActors } from './officeSim';
import { roomPlan } from './roomPlan';

const at = (n: number) => `2026-09-25T12:${String(n).padStart(2, '0')}:00.000Z`;
const plans = (rows: ReturnType<typeof managedRow>[]) => {
  const [room] = officeRooms(rows, PROJECTS);
  if (!room) throw new Error('no room');
  return roomPlan(room);
};
const ids = ['aaaaaaaa', 'bbbbbbbb', 'cccccccc', 'dddddddd', 'eeeeeeee', 'ffffffff', 'gggggggg'];
// A parent with two children, and four sessions on their own.
const plan = plans(
  ids.map((id, n) =>
    managedRow(id, { startedAt: at(n), ...(n === 1 || n === 2 ? { parentNow: 'aaaaaaaa' } : {}) }),
  ),
);

test('a family shares a table with its parent at the head, four alone share a bench, and every seat can be walked to', () => {
  expect(ids.map((id) => plan.seats[id]?.face)).toEqual([
    'down',
    'right',
    'left',
    'down',
    'up',
    'down',
    'up',
  ]);
  expect(ids.map((id) => plan.pcs[id]?.view)).toEqual([
    'back',
    'side',
    'side',
    'back',
    'front',
    'back',
    'front',
  ]);
  expect(plan.zones).toHaveLength(1);
  for (const seat of Object.values(plan.seats)) {
    expect(walkable(plan, seat)).toBe(true);
    const path = pathTo(plan, plan.entry, seat);
    expect(path.at(-1)).toMatchObject({ col: seat.col, row: seat.row });
    expect(path.every((cell) => walkable(plan, cell))).toBe(true);
  }
  expect(freeCells(plan)).not.toContainEqual({
    col: plan.seats.aaaaaaaa?.col,
    row: plan.seats.aaaaaaaa?.row,
  });
  expect(pathTo(plan, plan.entry, plan.entry)).toEqual([]);
});

test('three alone get a desk each, and a sofa cushion is furniture a character can still step onto', () => {
  const desks = plans(ids.slice(0, 3).map((id, n) => managedRow(id, { startedAt: at(n) })));
  expect(Object.values(desks.seats).map((seat) => seat.face)).toEqual(['up', 'up', 'up']);
  const sofa = desks.rests.find((rest) => rest.sit);
  if (!sofa) throw new Error('no sofa');
  expect(walkable(desks, sofa)).toBe(false);
  expect(pathTo(desks, desks.entry, sofa).at(-1)).toEqual({ col: sofa.col, row: sofa.row });
});

test('a character walks in and sits facing its screen; idle, it gets up for a sofa, then strolls on', () => {
  const actors = new Map<string, Actor>();
  const seat = plan.seats.dddddddd;
  if (!seat) throw new Error('no seat');
  const run = (from: number, to: number, random: () => number) => {
    for (let now = from; now < to; now += 100) stepActors(actors, plan, 0.1, now, random);
  };
  syncActors(actors, [{ id: 'dddddddd', seat }], plan, 0);
  const actor = actors.get('dddddddd');
  expect([actor?.x, actor?.y, actor?.seated]).toEqual([
    plan.entry.col * TILE,
    plan.entry.row * TILE,
    false,
  ]);
  run(0, 30_000, () => 0);
  expect([actor?.x, actor?.y, actor?.seated, actor?.dir]).toEqual([
    seat.col * TILE,
    seat.row * TILE,
    true,
    'down',
  ]);
  // The dice at 0 pick a sofa, its first free cushion.
  syncActors(actors, [{ id: 'dddddddd' }], plan, 30_000);
  expect(actor?.seated).toBe(false);
  run(30_000, 60_000, () => 0);
  expect(actor?.rest?.sit).toBe(true);
  expect([actor?.x, actor?.y, actor?.seated, actor?.dir]).toEqual([
    (actor?.rest?.col ?? 0) * TILE,
    (actor?.rest?.row ?? 0) * TILE,
    true,
    actor?.rest?.face,
  ]);
  // Later the dice pick a stroll: it leaves the cushion free.
  run(60_000, 90_000, () => 0.9);
  expect([actor?.rest, actor?.seated]).toEqual([undefined, false]);
  syncActors(actors, [], plan, 90_000);
  expect(actors.size).toBe(0);
});

test('rooms join into one building: shared walls, a doorway between them, every seat reached from the entry', () => {
  const rooms = officeRooms(
    [
      managedRow('aaaaaaaa', { startedAt: at(0) }),
      managedRow('bbbbbbbb', { startedAt: at(1), project: 'tide' }),
    ],
    PROJECTS,
  );
  const [wide, stacked] = [buildingPlan(rooms, 60), buildingPlan(rooms, 24)];
  const [first, second] = wide.rooms;
  // Side by side, the second room's left wall is the first one's right wall.
  expect(second?.col).toBe((first?.col ?? 0) + (first?.cols ?? 0) - 1);
  expect(stacked.rooms[1]).toMatchObject({ col: 0, row: (stacked.rooms[0]?.rows ?? 0) - 1 });
  for (const plan of [wide, stacked]) {
    expect(plan.doors).toHaveLength(2);
    const seat = plan.seats.bbbbbbbb;
    if (!seat) throw new Error('no seat');
    expect(pathTo(plan, plan.entry, seat).at(-1)).toMatchObject({ col: seat.col, row: seat.row });
    expect(
      freeCells(plan, 'tide').every(
        (cell) => cell.col > (plan.rooms[1]?.col ?? 0) || plan === stacked,
      ),
    ).toBe(true);
  }
});
