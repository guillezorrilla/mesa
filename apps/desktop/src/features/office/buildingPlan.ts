import { nameHash } from '@/lib/nameColor';
import type { Room } from './officeLayout';
import type { Cell, Plan } from './officePlan';
import { roomPlan } from './roomPlan';

/**
 * Every room as one building (CONTEXT.md, Office): rooms side by side sharing a wall, wrapped to
 * rows no wider than `maxCols` tiles, each row as tall as its tallest room and as wide as the
 * widest row, the next row's back wall on the one before's front wall. A doorway joins each room
 * to the one on its left, and each row to the one above, so every seat can be walked to from the
 * first room's entry.
 */
export function buildingPlan(rooms: readonly Room[], maxCols = 40): Plan {
  const seed = (room: Room) => nameHash(room.key);
  const natural = rooms.map((room) => roomPlan(room, seed(room)));
  const lines: number[][] = [];
  let wide = 0;
  natural.forEach((plan, i) => {
    const line = lines.at(-1);
    if (line && wide + plan.cols - 1 <= maxCols) {
      line.push(i);
      wide += plan.cols - 1;
    } else {
      lines.push([i]);
      wide = plan.cols;
    }
  });
  const widthOf = (line: number[]) =>
    line.reduce((sum, i, n) => sum + (natural[i] as Plan).cols - (n ? 1 : 0), 0);
  const cols = Math.max(0, ...lines.map(widthOf));
  const tallOf = (line: number[]) => Math.max(...line.map((i) => (natural[i] as Plan).rows));
  const rows = lines.reduce((sum, line) => sum + tallOf(line) - 1, 0) + (lines.length ? 1 : 0);
  const grid = () => Array.from({ length: rows }, () => Array<boolean>(cols).fill(false));
  const plan: Plan = {
    cols,
    rows,
    rooms: [],
    doors: [],
    zones: [],
    wall: [],
    items: [],
    seats: {},
    pcs: {},
    rests: [],
    floor: grid(),
    blocked: grid(),
    entry: { col: 1, row: Math.max(0, tallOf(lines[0] ?? []) - 2) },
  };
  const door = (cell: Cell) => {
    plan.doors.push(cell);
    (plan.floor[cell.row] as boolean[])[cell.col] = true;
  };
  let top = 0;
  lines.forEach((line, lineIndex) => {
    const tall = tallOf(line);
    let left = 0;
    line.forEach((i, n) => {
      const room = rooms[i] as Room;
      const last = n === line.length - 1;
      const part = roomPlan(room, seed(room), {
        cols: last ? cols - left : (natural[i] as Plan).cols,
        rows: tall,
      });
      const move = <T extends Cell>(cell: T): T => ({
        ...cell,
        col: cell.col + left,
        row: cell.row + top,
      });
      part.floor.forEach((cells, r) => {
        cells.forEach((isFloor, c) => {
          if (isFloor) (plan.floor[top + r] as boolean[])[left + c] = true;
          if (part.blocked[r]?.[c]) (plan.blocked[top + r] as boolean[])[left + c] = true;
        });
      });
      plan.rooms.push(...part.rooms.map((area) => ({ ...move(area), lounge: area.lounge + left })));
      plan.zones.push(...part.zones.map(move));
      plan.wall.push(...part.wall.map(move));
      plan.items.push(
        ...part.items.map((item) => ({
          ...move(item),
          ...(item.over === undefined ? {} : { over: item.over + top }),
        })),
      );
      plan.rests.push(...part.rests.map(move));
      for (const [id, seat] of Object.entries(part.seats)) plan.seats[id] = move(seat);
      for (const [id, pc] of Object.entries(part.pcs))
        plan.pcs[id] = { ...move(pc), over: pc.over + top };
      // Through the shared wall, at the front aisle.
      if (n > 0) for (const row of [top + tall - 3, top + tall - 2]) door({ col: left, row });
      left += part.cols - 1;
    });
    // Through this row's back wall, by its left wall, up to the row above's front aisle.
    if (lineIndex > 0) for (const row of [top, top + 1]) door({ col: 1, row });
    top += tall - 1;
  });
  return plan;
}
