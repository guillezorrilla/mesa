import {
  type Cell,
  type Dir,
  freeCells,
  type Plan,
  pathTo,
  type Rest,
  type Seat,
  TILE,
} from './officePlan';

// The characters' movement (CONTEXT.md, Office): each walks tile by tile to where its session's
// state puts it. One with a seat sits there; one without drifts between a sofa, the coffee bar
// and a stroll. Pure, with the clock and the dice passed in.

/** Where a character should be: at `seat` facing `face` (its screen, or the room), else at ease. */
export type Want = { id: string; seat?: Seat; face?: Dir; room?: string };
export type Actor = {
  id: string;
  /** Its tile's top-left corner, in art pixels. */
  x: number;
  y: number;
  dir: Dir;
  path: Cell[];
  seated: boolean;
  moving: boolean;
  /** The sofa cushion or coffee-bar place it has taken, while at ease. */
  rest?: Rest;
  /** When it next moves on, while at ease (ms). */
  restUntil: number;
  want: Want;
};

/** Art pixels a second. */
const SPEED = 44;
const cellOf = (actor: Actor): Cell => ({
  col: Math.round(actor.x / TILE),
  row: Math.round(actor.y / TILE),
});
const same = (a: Cell | undefined, b: Cell | undefined) => a?.col === b?.col && a?.row === b?.row;
const snap = (actor: Actor, to: Cell) => {
  actor.x = to.col * TILE;
  actor.y = to.row * TILE;
};

/**
 * `actors` brought in line with `wants`: a new one walks in from the plan's entry, one no longer
 * wanted leaves at once, and one whose seat changed gets up and walks there.
 */
export function syncActors(
  actors: Map<string, Actor>,
  wants: readonly Want[],
  plan: Plan,
  now: number,
) {
  const wanted = new Set(wants.map((want) => want.id));
  for (const id of actors.keys()) if (!wanted.has(id)) actors.delete(id);
  for (const want of wants) {
    const known = actors.get(want.id);
    const actor: Actor = known ?? {
      id: want.id,
      x: plan.entry.col * TILE,
      y: plan.entry.row * TILE,
      dir: 'up',
      path: [],
      seated: false,
      moving: false,
      restUntil: now,
      want,
    };
    const moved = !known || !same(known.want.seat, want.seat);
    actor.want = want;
    if (moved) {
      actor.seated = false;
      actor.rest = undefined;
      actor.path = want.seat ? pathTo(plan, cellOf(actor), want.seat) : [];
      actor.restUntil = now;
    }
    actors.set(want.id, actor);
  }
}

/** A rest nobody has taken, a sofa cushion (`sit`) or a place at the coffee bar, by the dice. */
function freeRest(
  actors: Map<string, Actor>,
  plan: Plan,
  sit: boolean,
  room: string | undefined,
  random: () => number,
) {
  const taken = [...actors.values()].map((actor) => actor.rest);
  const free = plan.rests.filter(
    (rest) =>
      rest.sit === sit &&
      (room === undefined || rest.room === room) &&
      !taken.some((other) => same(other, rest)),
  );
  return free[Math.floor(random() * free.length)];
}

/** Where a character at ease goes next: a sofa, the coffee bar, or a stroll, and for how long (ms). */
function nextEase(actor: Actor, actors: Map<string, Actor>, plan: Plan, random: () => number) {
  const dice = random();
  actor.rest =
    dice < 0.35
      ? freeRest(actors, plan, true, actor.want.room, random)
      : dice < 0.5
        ? freeRest(actors, plan, false, actor.want.room, random)
        : undefined;
  const free = freeCells(plan, actor.want.room);
  const to = actor.rest ?? free[Math.floor(random() * free.length)];
  const stay = actor.rest?.sit ? 9000 + random() * 14000 : 3000 + random() * 6000;
  return { to, stay };
}

/** Every actor moved on by `dt` seconds: along its path, into its seat, or on to its next rest. */
export function stepActors(
  actors: Map<string, Actor>,
  plan: Plan,
  dt: number,
  now: number,
  random: () => number,
) {
  for (const actor of actors.values()) {
    const next = actor.path[0];
    if (next) {
      const dx = next.col * TILE - actor.x;
      const dy = next.row * TILE - actor.y;
      const far = Math.hypot(dx, dy);
      const step = SPEED * dt;
      actor.moving = true;
      actor.seated = false;
      actor.dir =
        Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up';
      if (far <= step) {
        snap(actor, next);
        actor.path.shift();
      } else {
        actor.x += (dx / far) * step;
        actor.y += (dy / far) * step;
      }
      continue;
    }
    actor.moving = false;
    const { seat } = actor.want;
    if (seat) {
      // No way there (a plan redrawn under it): it takes its seat at once.
      snap(actor, seat);
      actor.seated = true;
      actor.dir = actor.want.face ?? seat.face;
    } else if (now >= actor.restUntil) {
      const { to, stay } = nextEase(actor, actors, plan, random);
      actor.path = to ? pathTo(plan, cellOf(actor), to) : [];
      if (!actor.path.length) actor.rest = undefined;
      actor.restUntil = now + (actor.path.length * TILE * 1000) / SPEED + stay;
      actor.seated = false;
    } else if (actor.rest && same(cellOf(actor), actor.rest)) {
      actor.seated = actor.rest.sit;
      actor.dir = actor.rest.face;
    }
  }
}

/**
 * Every actor put straight where it belongs, as an office already at work is found: at its seat,
 * or somewhere in its room, those `only` picks. For the first look, and a plan redrawn under them;
 * who comes later walks in.
 */
export function placeActors(
  actors: Map<string, Actor>,
  plan: Plan,
  random: () => number,
  only: (id: string) => boolean = () => true,
) {
  for (const actor of actors.values()) {
    if (!only(actor.id)) continue;
    const free = freeCells(plan, actor.want.room);
    const to = actor.want.seat ?? free[Math.floor(random() * free.length)];
    if (to) snap(actor, to);
    actor.path = [];
  }
}

/** Every actor put where it is going, without the walk (reduced motion). */
export function settleActors(actors: Map<string, Actor>, plan: Plan, random: () => number) {
  for (const actor of actors.values()) {
    const { seat } = actor.want;
    if (!seat && !actor.rest && !actor.path.length && actor.restUntil !== Number.POSITIVE_INFINITY)
      actor.path = [nextEase(actor, actors, plan, random).to].flatMap((to) => (to ? [to] : []));
    const to = seat ?? actor.rest ?? actor.path.at(-1);
    if (to) snap(actor, to);
    actor.path = [];
    actor.moving = false;
    actor.restUntil = Number.POSITIVE_INFINITY;
    actor.seated = Boolean(seat ?? actor.rest?.sit);
    actor.dir = seat ? (actor.want.face ?? seat.face) : (actor.rest?.face ?? 'down');
  }
}
