// The Office's floor plan, in tiles (CONTEXT.md, Office): what stands where, which tiles a
// character may walk, and the way between two of them. Pure.

/** One tile's side, in art pixels. */
export const TILE = 16;
/** A room's first floor row: its back wall's face takes the two above it. */
export const FLOOR = 2;
export type Cell = { col: number; row: number };
export type Dir = 'down' | 'up' | 'right' | 'left';
/**
 * A sprite at a tile: `flip` mirrors it; `under` is furniture a character sits on, drawn below
 * whoever is on its tile; `over` is the row whose furniture it stands on (a PC on a table).
 */
export type Item = Cell & { art: string; flip?: boolean; under?: true; over?: number };
/** A session's chair and the way it faces to work. */
export type Seat = Cell & { face: Dir };
/** Its PC: seen from the front, the back, or the side (`flip` for one that faces right). */
export type Pc = Cell & { view: 'front' | 'back' | 'side'; flip?: boolean; over: number };
/** Where an idle character of `room` may rest: a sofa cushion (`sit`) or a place at its coffee bar. */
export type Rest = Cell & { face: Dir; sit: boolean; room: string };
/** A room's place in the plan, walls included, and its first lounge column (carpet from there). */
export type Area = Cell & {
  key: string;
  label: string;
  cols: number;
  rows: number;
  lounge: number;
};
export type Plan = {
  cols: number;
  rows: number;
  rooms: Area[];
  /** The wall tiles opened into doorways between rooms. */
  doors: Cell[];
  /** A family's table (a parent and its children in a room): its rug takes the family's colour. */
  zones: { col: number; row: number; cols: number; rows: number; family: string }[];
  /** What hangs on the back walls, part of the background. */
  wall: Item[];
  /** Furniture, drawn in depth order with the characters. */
  items: Item[];
  seats: Record<string, Seat>;
  pcs: Record<string, Pc>;
  rests: Rest[];
  /** The tiles that are floor, and those of them furniture stands on. */
  floor: boolean[][];
  blocked: boolean[][];
  /** Where a character walks in from. */
  entry: Cell;
};

/** Whether a character may stand on `cell`: floor with no furniture on it. */
export const walkable = (plan: Plan, { col, row }: Cell) =>
  Boolean(plan.floor[row]?.[col]) && !plan.blocked[row]?.[col];

/** The tiles a strolling character may pick, in `room` when given: walkable, and nobody's chair. */
export function freeCells(plan: Plan, room?: string): Cell[] {
  const chairs = new Set(Object.values(plan.seats).map((seat) => `${seat.col},${seat.row}`));
  const out: Cell[] = [];
  for (const area of plan.rooms) {
    if (room !== undefined && area.key !== room) continue;
    for (let row = area.row; row < area.row + area.rows; row++)
      for (let col = area.col + 1; col < area.col + area.cols - 1; col++)
        if (walkable(plan, { col, row }) && !chairs.has(`${col},${row}`)) out.push({ col, row });
  }
  return out;
}

/**
 * The shortest way from `from` to `to` over walkable tiles, a step up, down, left or right at a
 * time, without `from` itself; `to` may be furniture (a sofa cushion), stepped onto last. Empty
 * when they are the same tile or there is no way.
 */
export function pathTo(plan: Plan, from: Cell, to: Cell): Cell[] {
  const key = (cell: Cell) => cell.row * plan.cols + cell.col;
  const came = new Map<number, Cell | null>([[key(from), null]]);
  const queue = [from];
  for (let at = queue.shift(); at; at = queue.shift()) {
    if (at.col === to.col && at.row === to.row) {
      const path: Cell[] = [];
      for (
        let step: Cell | null | undefined = at;
        step && step !== from;
        step = came.get(key(step))
      )
        path.unshift(step);
      return path;
    }
    for (const [dc, dr] of [
      [0, -1],
      [1, 0],
      [0, 1],
      [-1, 0],
    ] as const) {
      const next = { col: at.col + dc, row: at.row + dr };
      const goal = next.col === to.col && next.row === to.row;
      if (came.has(key(next)) || !(goal || walkable(plan, next))) continue;
      came.set(key(next), at);
      queue.push(next);
    }
  }
  return [];
}
