import type { TreeRow } from '@mesa/core';
import { characterSheet, FRAME, FRAMES, look, ROWS } from './characterArt';
import { sprite, spriteHeight } from './officeArt';
import { type Plan, TILE, walkable } from './officePlan';
import type { Pose } from './officePose';
import type { Actor } from './officeSim';

/** One character of a room: a session at its seat, or one visiting from another room. */
export type Member = {
  key: string;
  /** The room it is drawn in: its own, or the one it visits. */
  room: string;
  /** It has children seated at its table. */
  lead: boolean;
  row: TreeRow;
  family: string;
  pose: Pose;
  child: boolean;
  reportsTo?: string;
  visitor?: string;
};

/** The most subagents drawn beside a seat; the rest are counted on its nameplate. */
const ROBOTS = 3;
/** How far a seated character leans to its table, by the way it faces, in art pixels. */
const LEAN = { up: [0, -3], down: [0, 2], right: [1, -1], left: [-1, -1] } as const;

/**
 * A room's furniture, PCs, robots and characters over its background, nearest the viewer last. A
 * PC is lit while its session works; a seated character types, reads or waves as its pose says,
 * and one on a sofa just sits.
 */
export function drawRoom(
  ctx: CanvasRenderingContext2D,
  plan: Plan,
  members: readonly Member[],
  actors: ReadonlyMap<string, Actor>,
  now: number,
) {
  const things: { depth: number; draw: () => void }[] = [];
  const put = (
    art: HTMLCanvasElement | undefined,
    x: number,
    y: number,
    depth: number,
    flip = false,
  ) => {
    if (!art) return;
    things.push({
      depth,
      draw: () => {
        if (!flip) return ctx.drawImage(art, x, y);
        ctx.save();
        ctx.translate(x + art.width, y);
        ctx.scale(-1, 1);
        ctx.drawImage(art, 0, 0);
        ctx.restore();
      },
    });
  };
  for (const item of plan.items) {
    const depth = item.under
      ? item.row * TILE + 1
      : item.over !== undefined
        ? item.over * TILE + 0.1
        : item.row * TILE + spriteHeight(item.art);
    put(sprite(item.art), item.col * TILE, item.row * TILE, depth, item.flip);
  }
  for (const member of members) {
    const { row, pose } = member;
    const style = look(row.id, member.family);
    const pc = member.visitor ? undefined : plan.pcs[row.id];
    if (pc) {
      const on = pose.state === 'working';
      const art =
        pc.view === 'front'
          ? on
            ? `pc_on_${1 + (Math.floor(now / 350) % 3)}`
            : 'pc_off'
          : `pc_${pc.view}_${on ? 'on' : 'off'}`;
      put(sprite(art), pc.col * TILE, pc.row * TILE, pc.over * TILE + 0.1, pc.flip);
    }
    const seat = member.visitor ? undefined : plan.seats[row.id];
    if (seat && row.managed && row.subagents?.length) {
      const around = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [1, 1],
        [-1, 1],
        [0, -1],
      ]
        .map(([dc, dr]) => ({ col: seat.col + (dc as number), row: seat.row + (dr as number) }))
        .filter((cell) => walkable(plan, cell));
      around.slice(0, Math.min(ROBOTS, row.subagents.length)).forEach((cell, i) => {
        const bob = Math.floor(now / 400 + i) % 2;
        put(
          sprite('robot', style.shirt),
          cell.col * TILE,
          cell.row * TILE - 2 - bob,
          (cell.row + 1) * TILE,
        );
      });
    }
    const actor = actors.get(member.key);
    const art = characterSheet(style);
    if (!actor || !art) continue;
    const working = actor.seated && actor.want.seat !== undefined;
    const cycle = actor.moving
      ? FRAMES.walk
      : !actor.seated
        ? [1]
        : working && (pose.does === 'type' || pose.does === 'read' || pose.does === 'wave')
          ? FRAMES[pose.does]
          : FRAMES.sit;
    const frame = cycle[Math.floor(now / (actor.moving ? 130 : 280)) % cycle.length] as number;
    const [leanX, leanY] = actor.seated ? LEAN[actor.dir] : [0, 0];
    const x = Math.round(actor.x) + leanX;
    const y = Math.round(actor.y) + TILE - FRAME.h + leanY;
    things.push({
      depth: actor.y + TILE + 0.05,
      draw: () => {
        ctx.save();
        if (!actor.seated) {
          ctx.globalAlpha = 0.25;
          ctx.fillStyle = '#000000';
          ctx.fillRect(x + 3, y + FRAME.h - 2, 10, 2);
        }
        ctx.globalAlpha = member.visitor ? 0.6 : pose.state === 'stopped' ? 0.5 : 1;
        if (actor.dir === 'left') {
          ctx.translate(x + FRAME.w, y);
          ctx.scale(-1, 1);
        } else ctx.translate(x, y);
        ctx.drawImage(
          art,
          frame * FRAME.w,
          ROWS[actor.dir] * FRAME.h,
          FRAME.w,
          FRAME.h,
          0,
          0,
          FRAME.w,
          FRAME.h,
        );
        ctx.restore();
      },
    });
  }
  things.sort((a, b) => a.depth - b.depth);
  for (const thing of things) thing.draw();
}
