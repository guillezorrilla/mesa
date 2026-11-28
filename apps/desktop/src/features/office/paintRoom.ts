import { sprite } from './officeArt';
import { type Plan, TILE } from './officePlan';
import { type Ctx, painter, shade } from './pixels';

// The building's background, painted once per plan: floors, walls, rugs, doorways, wall art.

const WALL = {
  cap: '#161c2c',
  face: '#2b3650',
  light: '#36435f',
  base: '#1d2538',
  void: '#0e1220',
};

/** One floor board tile, or one of the lounge's carpet. */
function floorTile(ctx: Ctx, col: number, row: number, carpet: boolean) {
  const t = painter(ctx, col * TILE, row * TILE);
  if (carpet) {
    t('#40618c', 0, 0, TILE, TILE);
    for (const [x, y] of [
      [3, 3],
      [11, 6],
      [6, 12],
      [14, 14],
    ] as const)
      t('#4a6d9a', x, y);
    for (const [x, y] of [
      [8, 2],
      [1, 9],
      [12, 11],
    ] as const)
      t('#385780', x, y);
    return;
  }
  t('#8b5e3c', 0, 0, TILE, TILE);
  t('#734a2d', 0, 7, TILE, 1);
  t('#734a2d', 0, 15, TILE, 1);
  t('#734a2d', 10, 0, 1, 7);
  t('#734a2d', 3, 8, 1, 7);
  t('#9a6c47', 1, 1, 6, 1);
  t('#9a6c47', 5, 9, 7, 1);
}

/**
 * The building's background: each room's floor (boards, the lounge's carpet, a family's rug in
 * its colour) inside its walls, what hangs on its back wall, and the doorways between rooms.
 * `tint` gives a family's colour.
 */
export function paintRoom(ctx: Ctx, plan: Plan, tint: (family: string) => string) {
  const p = painter(ctx);
  p(WALL.void, 0, 0, plan.cols * TILE, plan.rows * TILE);
  for (const area of plan.rooms) {
    const [x, y, width, height] = [
      area.col * TILE,
      area.row * TILE,
      area.cols * TILE,
      area.rows * TILE,
    ];
    for (let row = area.row + 2; row <= area.row + area.rows - 2; row++)
      for (let col = area.col + 1; col <= area.col + area.cols - 2; col++)
        floorTile(ctx, col, row, col >= area.lounge);
    // The back wall's face, two tiles tall, then the walls seen from above.
    p(WALL.face, x + TILE, y, width - 2 * TILE, 2 * TILE);
    p(WALL.cap, x + TILE, y, width - 2 * TILE, 4);
    p(WALL.light, x + TILE, y + 4, width - 2 * TILE, 1);
    p(WALL.base, x + TILE, y + 2 * TILE - 4, width - 2 * TILE, 4);
    ctx.globalAlpha = 0.2;
    p('#000000', x + TILE, y + 2 * TILE, width - 2 * TILE, 3);
    ctx.globalAlpha = 1;
    for (const wallX of [x, x + width - TILE]) p(WALL.cap, wallX, y, TILE, height);
    p(WALL.light, x + TILE - 2, y + 2 * TILE, 2, height - 3 * TILE);
    p(WALL.light, x + width - TILE, y + 2 * TILE, 2, height - 3 * TILE);
    p(WALL.cap, x, y + height - TILE, width, TILE);
    p(WALL.light, x + TILE, y + height - TILE, width - 2 * TILE, 2);
  }
  // A family's rug: woven in its colour, with a lighter band inside the edge.
  for (const zone of plan.zones) {
    const [x, y, w, h] = [
      zone.col * TILE,
      zone.row * TILE + 4,
      zone.cols * TILE,
      zone.rows * TILE - 6,
    ];
    const color = tint(zone.family);
    p(shade(color, 0.5), x, y, w, h);
    p(shade(color, 0.7), x, y + 2, w, h - 4);
    p(shade(color, 0.95), x, y + 4, w, 1);
    p(shade(color, 0.95), x, y + h - 5, w, 1);
    for (let fx = x + 3; fx < x + w; fx += 6) p(shade(color, 0.6), fx, y + h / 2, 2, 1);
  }
  for (const door of plan.doors) {
    floorTile(ctx, door.col, door.row, false);
    ctx.globalAlpha = 0.18;
    p('#000000', door.col * TILE, door.row * TILE, TILE, TILE);
    ctx.globalAlpha = 1;
  }
  for (const item of plan.wall) {
    const art = sprite(item.art);
    if (art) ctx.drawImage(art, item.col * TILE, item.row * TILE);
  }
}
