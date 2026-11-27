import type { Desk, Room } from './officeLayout';
import { FLOOR, type Item, type Plan, type Rest } from './officePlan';

// One room's floor plan (CONTEXT.md, Office): a coworking floor of shared tables, benches and
// desks on the left, a lounge on the right. Pure.

/** The widest the work floor grows before its furniture wraps to a new row, in tiles. */
const WORK_COLS = 18;
const WALL_ART = ['bookshelf', 'window', 'whiteboard', 'window'];

/** A piece of the work floor: its footprint with its aisle, and what it puts at (`col`, `row`). */
type Station = { cols: number; rows: number; place: (col: number, row: number) => void };

/**
 * The plan for `room` alone, at least `fit` tiles wide and tall. A family shares one table, sitting down its two sides; other sessions take
 * a double-sided bench in sixes and fours, and a desk of their own when fewer are left. The
 * furniture fills rows left to right in seat order. `seed` varies the wall's decoration by room.
 */
export function roomPlan(room: Room, seed = 0, fit: { cols?: number; rows?: number } = {}): Plan {
  const items: Item[] = [];
  const seats: Plan['seats'] = {};
  const pcs: Plan['pcs'] = {};
  const zones: Plan['zones'] = [];
  const tables: [col: number, row: number, cols: number, rows: number][] = [];
  const chair = (col: number, row: number) => items.push({ art: 'chair', col, row, under: true });
  const solo = (desk?: Desk): Station => ({
    cols: 4,
    rows: 4,
    place: (col, row) => {
      items.push({ art: 'desk', col, row });
      tables.push([col, row, 3, 2]);
      chair(col + 1, row + 2);
      if (!desk) return void items.push({ art: 'pc_off', col: col + 1, row, over: row + 2 });
      seats[desk.row.id] = { col: col + 1, row: row + 2, face: 'up' };
      pcs[desk.row.id] = { col: col + 1, row, view: 'front', over: row + 2 };
    },
  });
  /** A family's table: its parent at the head, facing the room, when `led`; the rest down its sides. */
  const family = (desks: Desk[], led: boolean): Station => {
    const sides = led ? desks.slice(1) : desks;
    const pairs = Math.max(1, Math.ceil(sides.length / 2));
    return {
      cols: 7,
      rows: 2 * pairs + 3,
      place: (col, row) => {
        const bottom = row + 2 + 2 * pairs;
        items.push({ art: `slab:3x${2 * pairs}`, col: col + 1, row: row + 2 });
        tables.push([col + 1, row + 2, 3, 2 * pairs]);
        zones.push({
          col,
          row: row + 1,
          cols: 5,
          rows: 2 * pairs + 1,
          family: (desks[0] as Desk).family,
        });
        const head = led ? desks[0] : undefined;
        if (head) {
          chair(col + 2, row + 1);
          seats[head.row.id] = { col: col + 2, row: row + 1, face: 'down' };
          pcs[head.row.id] = { col: col + 2, row: row + 2, view: 'back', over: bottom };
        }
        sides.forEach((desk, i) => {
          const right = i % 2 === 1;
          const at = row + 3 + 2 * Math.floor(i / 2);
          chair(col + (right ? 4 : 0), at);
          seats[desk.row.id] = {
            col: col + (right ? 4 : 0),
            row: at,
            face: right ? 'left' : 'right',
          };
          pcs[desk.row.id] = {
            col: col + (right ? 3 : 1),
            row: at - 1,
            view: 'side',
            flip: right,
            over: bottom,
          };
        });
      },
    };
  };
  const bench = (desks: Desk[]): Station => {
    const wide = 3 * Math.ceil(desks.length / 2);
    return {
      cols: wide + 2,
      rows: 7,
      place: (col, row) => {
        items.push({ art: `slab:${wide}x3`, col, row: row + 2 });
        tables.push([col, row + 2, wide, 3]);
        desks.forEach((desk, i) => {
          const far = i % 2 === 0;
          const at = col + 1 + 3 * Math.floor(i / 2);
          chair(at, far ? row + 1 : row + 5);
          seats[desk.row.id] = { col: at, row: far ? row + 1 : row + 5, face: far ? 'down' : 'up' };
          pcs[desk.row.id] = {
            col: at,
            row: far ? row + 2 : row + 3,
            view: far ? 'back' : 'front',
            over: row + 5,
          };
        });
      },
    };
  };
  const stations: Station[] = [];
  const alone: Desk[] = [];
  for (const desk of room.desks) {
    if (desk.row.id !== desk.pod) continue;
    const pod = room.desks.filter((other) => other.pod === desk.pod);
    if (pod.length === 1) alone.push(desk);
    else
      for (let i = 0; i < pod.length; i += 7) stations.push(family(pod.slice(i, i + 7), i === 0));
  }
  while (alone.length >= 4) stations.push(bench(alone.splice(0, alone.length >= 6 ? 6 : 4)));
  for (const desk of alone) stations.push(solo(desk));
  if (stations.length < 2) stations.push(solo());
  let [col, row, tall, wide] = [2, FLOOR + 1, 0, 0];
  for (const station of stations) {
    if (col > 2 && col + station.cols > 2 + WORK_COLS) [col, row, tall] = [2, row + tall, 0];
    station.place(col, row);
    col += station.cols;
    tall = Math.max(tall, station.rows);
    wide = Math.max(wide, col - 2);
  }
  const lounge = 2 + Math.max(wide, 8);
  const cols = Math.max(lounge + 6, fit.cols ?? 0);
  const lastFloor = Math.max(row + tall - 1, FLOOR + 7, (fit.rows ?? 0) - 2);
  const rows = lastFloor + 2;
  const blocked = Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const block = (c: number, r: number, w = 1, h = 1) => {
    for (let y = r; y < r + h; y++)
      for (let x = c; x < c + w; x++) (blocked[y] as boolean[])[x] = true;
  };
  for (const table of tables) block(...table);
  const wall: Item[] = [];
  for (let i = 0; 2 + i * 4 + 3 < lounge; i++) {
    wall.push({ art: WALL_ART[(i + seed) % WALL_ART.length] as string, col: 2 + i * 4, row: 0 });
    wall.push({ art: (i + seed) % 2 ? 'clock' : 'painting', col: 5 + i * 4, row: 0 });
  }
  wall.push({ art: 'painting_wide', col: lounge, row: 0 });
  // The lounge: a coffee bar on the back wall, then two sofas facing over a table, one at each end.
  const top = FLOOR + 2;
  items.push(
    { art: 'coffee_bar', col: lounge + 2, row: FLOOR - 1 },
    { art: 'sofa_front', col: lounge + 1, row: top, under: true },
    { art: 'sofa_side', col: lounge, row: top + 1, under: true },
    { art: 'table', col: lounge + 1, row: top + 1 },
    { art: 'sofa_side', col: lounge + 3, row: top + 1, flip: true, under: true },
    { art: 'sofa_back', col: lounge + 1, row: top + 3, over: top + 4 },
    { art: 'plant', col: cols - 2, row: FLOOR - 1 },
    { art: 'bin', col: lounge - 1, row: lastFloor },
  );
  block(lounge + 2, FLOOR, 2);
  block(lounge, top, 4, 4);
  block(cols - 2, FLOOR);
  block(lounge - 1, lastFloor);
  const rests: Rest[] = [
    ...[1, 2].map((c) => ({
      col: lounge + c,
      row: top,
      face: 'down' as const,
      sit: true,
      room: room.key,
    })),
    ...[1, 2].map((r) => ({
      col: lounge,
      row: top + r,
      face: 'right' as const,
      sit: true,
      room: room.key,
    })),
    ...[1, 2].map((r) => ({
      col: lounge + 3,
      row: top + r,
      face: 'left' as const,
      sit: true,
      room: room.key,
    })),
    ...[1, 2].map((c) => ({
      col: lounge + c,
      row: top + 3,
      face: 'up' as const,
      sit: true,
      room: room.key,
    })),
    ...[2, 3].map((c) => ({
      col: lounge + c,
      row: FLOOR + 1,
      face: 'up' as const,
      sit: false,
      room: room.key,
    })),
  ];
  const floor = blocked.map((line, r) =>
    line.map((_, c) => c >= 1 && c <= cols - 2 && r >= FLOOR && r <= lastFloor),
  );
  return {
    cols,
    rows,
    rooms: [{ key: room.key, label: room.label, col: 0, row: 0, cols, rows, lounge }],
    doors: [],
    zones,
    wall,
    items,
    seats,
    pcs,
    rests,
    floor,
    blocked,
    entry: { col: 1, row: lastFloor },
  };
}
