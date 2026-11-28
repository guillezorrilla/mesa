import { TILE } from './officePlan';
import { outline, painter, type Rect, shade, sheet } from './pixels';

// The Office's rooms and furniture, painted in code: each sprite once, into its own small canvas.

type Sprite = { w: number; h: number; ink: string; paint: (p: Rect, tint: string) => void };
const WOOD = '#c9a36b';
const WOOD_DARK = '#a9814c';
const BOOKS = ['#c0443f', '#3f7ac0', '#e0b84a', '#4fa56a', '#e8e3d5', '#8c4fb0'];
const SOFA = '#b04d72';

const pc = (screen: string, lines: readonly (readonly [number, number, number])[]): Sprite => ({
  w: 16,
  h: 32,
  ink: '#4a463e',
  paint: (p) => {
    p('#bdb9ad', 6, 15, 4, 2);
    p('#d9d5c8', 2, 2, 12, 13);
    p('#bdb9ad', 2, 13, 12, 2);
    p(screen, 4, 4, 8, 8);
    for (const [x, y, w] of lines) p('#5be37d', x, y, w, 1);
    p('#d9d5c8', 2, 19, 10, 3);
    p('#a8a498', 3, 20, 8, 1);
    p('#d9d5c8', 13, 19, 2, 3);
  },
});

/** A PC seen from the left side, its screen facing left and lit in `glow`. */
function pcSide(glow: string): Sprite {
  return {
    w: 16,
    h: 32,
    ink: '#4a463e',
    paint: (p) => {
      p('#bdb9ad', 8, 15, 4, 2);
      p('#d9d5c8', 6, 3, 8, 12);
      p('#bdb9ad', 11, 3, 3, 12);
      p(glow, 4, 4, 2, 10);
      p('#d9d5c8', 1, 19, 5, 3);
      p('#a8a498', 2, 20, 3, 1);
    },
  };
}

/** A PC seen from behind: its casing, with a light that is `glow` while it is on. */
function pcBack(glow: string): Sprite {
  return {
    w: 16,
    h: 16,
    ink: '#4a463e',
    paint: (p) => {
      p('#bdb9ad', 6, 12, 4, 2);
      p('#c9c5b8', 2, 1, 12, 11);
      p('#a8a498', 4, 3, 8, 1);
      p('#a8a498', 4, 5, 8, 1);
      p('#a8a498', 4, 7, 8, 1);
      p(glow, 11, 9, 2, 1);
    },
  };
}

/** A table of `cols` by `rows` tiles, seen from above with its front edge and legs. */
function slab(cols: number, rows: number): Sprite {
  const [w, h] = [cols * TILE, rows * TILE];
  return {
    w,
    h,
    ink: '#3b2a1c',
    paint: (p) => {
      p(WOOD, 1, 2, w - 2, h - 10);
      p('#dcb983', 1, 2, w - 2, 1);
      for (let y = 7; y < h - 10; y += 5) p('#b98f58', 4 + ((y * 7) % (w - 20)), y, 12, 1);
      p(WOOD_DARK, 1, h - 8, w - 2, 4);
      p('#8a673a', 1, h - 5, w - 2, 1);
      p('#6e727d', 3, h - 4, 3, 4);
      p('#6e727d', w - 6, h - 4, 3, 4);
    },
  };
}

/** The sprite a name stands for; `slab:3x4` is a table of that many tiles. */
function named(name: string): Sprite | undefined {
  const size = /^slab:(\d+)x(\d+)$/.exec(name);
  return size ? slab(Number(size[1]), Number(size[2])) : SPRITES[name];
}

const SPRITES: Record<string, Sprite> = {
  desk: {
    w: 48,
    h: 32,
    ink: '#3b2a1c',
    paint: (p) => {
      p(WOOD, 1, 6, 46, 16);
      p('#dcb983', 1, 6, 46, 1);
      for (const [x, y, w] of [
        [4, 11, 14],
        [26, 15, 12],
        [10, 18, 9],
        [34, 9, 8],
      ] as const)
        p('#b98f58', x, y, w, 1);
      p(WOOD_DARK, 1, 22, 46, 4);
      p('#8a673a', 1, 25, 46, 1);
      p('#6e727d', 3, 26, 3, 5);
      p('#6e727d', 42, 26, 3, 5);
    },
  },
  pc_off: pc('#1b1e26', []),
  pc_on_1: pc('#10301f', [
    [5, 5, 4],
    [5, 7, 6],
    [5, 9, 3],
  ]),
  pc_on_2: pc('#10301f', [
    [5, 5, 6],
    [5, 7, 3],
    [5, 9, 5],
  ]),
  pc_on_3: pc('#10301f', [
    [5, 5, 3],
    [5, 7, 5],
    [5, 9, 6],
    [10, 10, 1],
  ]),
  chair: {
    w: 16,
    h: 16,
    ink: '#2c4a36',
    paint: (p) => {
      p('#5a4634', 4, 12, 2, 3);
      p('#5a4634', 10, 12, 2, 3);
      p('#63a873', 3, 3, 10, 8);
      p('#7cc08b', 4, 4, 8, 2);
      p('#44855a', 3, 10, 10, 2);
    },
  },
  plant: {
    w: 16,
    h: 32,
    ink: '#1d3a26',
    paint: (p) => {
      for (const [color, x, y, w, h] of [
        ['#2f7a45', 7, 8, 2, 14],
        ['#3a9455', 4, 10, 3, 11],
        ['#3a9455', 9, 9, 3, 12],
        ['#4fb46a', 3, 12, 2, 5],
        ['#4fb46a', 11, 11, 2, 6],
        ['#2f7a45', 6, 5, 2, 4],
        ['#4fb46a', 8, 6, 2, 3],
        ['#3a9455', 2, 14, 1, 3],
        ['#3a9455', 13, 13, 1, 4],
      ] as const)
        p(color, x, y, w, h);
      p('#b9683f', 5, 23, 6, 6);
      p('#cf7d50', 4, 22, 8, 2);
      p('#96512f', 9, 24, 2, 5);
    },
  },
  bin: {
    w: 16,
    h: 16,
    ink: '#3a3f4a',
    paint: (p) => {
      p('#9aa1ad', 4, 5, 8, 9);
      p('#c3c9d3', 3, 4, 10, 2);
      p('#3a3f4a', 5, 5, 6, 1);
      p('#7b828e', 10, 6, 2, 8);
    },
  },
  sofa_front: {
    w: 32,
    h: 16,
    ink: '#3d1a28',
    paint: (p) => {
      p(shade(SOFA, 0.8), 1, 1, 30, 6);
      p(SOFA, 1, 1, 30, 1);
      p(SOFA, 2, 7, 28, 6);
      p(shade(SOFA, 0.85), 16, 7, 1, 6);
      p(shade(SOFA, 0.7), 0, 4, 3, 10);
      p(shade(SOFA, 0.7), 29, 4, 3, 10);
    },
  },
  sofa_back: {
    w: 32,
    h: 16,
    ink: '#3d1a28',
    paint: (p) => {
      p(shade(SOFA, 0.7), 1, 2, 30, 11);
      p(shade(SOFA, 0.85), 1, 2, 30, 2);
      p(shade(SOFA, 0.6), 0, 4, 2, 10);
      p(shade(SOFA, 0.6), 30, 4, 2, 10);
    },
  },
  sofa_side: {
    w: 16,
    h: 32,
    ink: '#3d1a28',
    paint: (p) => {
      p(shade(SOFA, 0.8), 1, 2, 5, 27);
      p(SOFA, 6, 4, 8, 23);
      p(shade(SOFA, 0.85), 6, 15, 8, 1);
      p(shade(SOFA, 0.7), 1, 1, 13, 3);
      p(shade(SOFA, 0.7), 1, 27, 13, 3);
    },
  },
  table: {
    w: 32,
    h: 32,
    ink: '#3b2a1c',
    paint: (p) => {
      p(WOOD, 2, 4, 28, 20);
      p(WOOD_DARK, 2, 4, 28, 1);
      p(WOOD_DARK, 2, 4, 1, 20);
      p(WOOD_DARK, 29, 4, 1, 20);
      p('#dcb983', 4, 6, 24, 1);
      p(WOOD_DARK, 2, 24, 28, 3);
      p('#6b4a2b', 3, 27, 3, 3);
      p('#6b4a2b', 26, 27, 3, 3);
      p('#e8e8ee', 13, 12, 5, 5);
      p('#b9bcc7', 18, 13, 2, 3);
      p('#5a3a22', 14, 13, 3, 1);
    },
  },
  bookshelf: {
    w: 32,
    h: 32,
    ink: '#2a1c10',
    paint: (p) => {
      p('#6b4a2b', 1, 5, 30, 20);
      p('#3a2817', 2, 6, 28, 18);
      p('#8a623a', 1, 14, 30, 2);
      p('#8a623a', 1, 23, 30, 2);
      for (const base of [14, 23])
        for (let i = 0; i < 9; i++) {
          const tall = 5 + ((i * 7 + base) % 3);
          p(BOOKS[(i + base) % BOOKS.length] as string, 3 + i * 3, base - tall, 2, tall);
        }
    },
  },
  window: {
    w: 32,
    h: 32,
    ink: '#3a4254',
    paint: (p) => {
      p('#cfd4dc', 2, 4, 28, 20);
      p('#8ec7ea', 4, 6, 24, 16);
      p('#cfd4dc', 15, 6, 2, 16);
      p('#cfd4dc', 4, 13, 24, 1);
      p('#d8f0fb', 6, 8, 4, 1);
      p('#d8f0fb', 7, 9, 2, 1);
      p('#d8f0fb', 20, 16, 5, 1);
      p('#aab0bb', 1, 24, 30, 2);
    },
  },
  whiteboard: {
    w: 32,
    h: 32,
    ink: '#3a4254',
    paint: (p) => {
      p('#aab0bb', 2, 5, 28, 18);
      p('#f2f4f7', 3, 6, 26, 16);
      for (const [color, x, y, w] of [
        ['#d0483f', 6, 9, 9],
        ['#d0483f', 6, 12, 6],
        ['#3f7ac0', 17, 10, 8],
        ['#3f7ac0', 17, 13, 5],
        ['#3f7ac0', 19, 16, 6],
        ['#4fa56a', 7, 16, 7],
      ] as const)
        p(color, x, y, w, 1);
      p('#8b919c', 6, 23, 20, 1);
    },
  },
  clock: {
    w: 16,
    h: 32,
    ink: '#5a1f1b',
    paint: (p) => {
      p('#d0483f', 5, 8, 6, 12);
      p('#d0483f', 4, 9, 8, 10);
      p('#d0483f', 3, 10, 10, 8);
      p('#f4f5f7', 5, 10, 6, 8);
      p('#f4f5f7', 4, 11, 8, 6);
      p('#2a2f3a', 8, 11, 1, 4);
      p('#2a2f3a', 8, 14, 3, 1);
    },
  },
  painting: {
    w: 16,
    h: 32,
    ink: '#4a3716',
    paint: (p) => {
      p('#b08a4a', 3, 8, 10, 12);
      p('#27324a', 4, 9, 8, 10);
      p('#e0b84a', 6, 11, 3, 3);
      p('#4fa56a', 4, 16, 8, 3);
    },
  },
  painting_wide: {
    w: 32,
    h: 32,
    ink: '#4a3716',
    paint: (p) => {
      p('#b08a4a', 3, 7, 26, 14);
      p('#8ec7ea', 4, 8, 24, 7);
      p('#f4d35e', 21, 9, 3, 3);
      p('#6c7fa3', 8, 11, 6, 3);
      p('#6c7fa3', 10, 9, 2, 2);
      p('#4fa56a', 4, 14, 24, 3);
      p('#3a8a52', 4, 17, 24, 3);
    },
  },
  pc_side_on: pcSide('#5be37d'),
  pc_side_off: pcSide('#2e3340'),
  pc_back_on: pcBack('#5be37d'),
  pc_back_off: pcBack('#6a665c'),
  coffee_bar: {
    w: 32,
    h: 32,
    ink: '#2a1c10',
    paint: (p) => {
      // A cabinet against the wall, a coffee machine and a stack of cups on it.
      p('#8a623a', 1, 16, 30, 14);
      p(WOOD, 1, 14, 30, 3);
      p('#dcb983', 1, 14, 30, 1);
      p('#6b4a2b', 15, 18, 1, 12);
      p('#3a2817', 7, 22, 2, 2);
      p('#3a2817', 22, 22, 2, 2);
      p('#3a3f4a', 4, 3, 10, 11);
      p('#5a606c', 4, 3, 10, 2);
      p('#10151f', 6, 7, 6, 4);
      p('#d0483f', 12, 6, 1, 1);
      p('#e8e8ee', 8, 11, 3, 3);
      for (const x of [19, 23]) {
        p('#e8e8ee', x, 9, 3, 5);
        p('#b9bcc7', x, 11, 3, 1);
      }
    },
  },
  robot: {
    w: 16,
    h: 16,
    ink: '#10151f',
    paint: (p, tint) => {
      p('#9aa1ad', 8, 0, 1, 2);
      p(tint, 4, 2, 8, 5);
      p('#10151f', 6, 4, 1, 2);
      p('#10151f', 9, 4, 1, 2);
      p(tint, 5, 7, 6, 6);
      p(shade(tint, 0.75), 3, 8, 2, 3);
      p(shade(tint, 0.75), 11, 8, 2, 3);
      p('#646c7a', 5, 13, 2, 2);
      p('#646c7a', 9, 13, 2, 2);
    },
  },
};

const painted = new Map<string, HTMLCanvasElement | undefined>();

/** The sprite `name`, painted once (a robot once per `tint`); none where a canvas cannot draw. */
export function sprite(name: string, tint = '') {
  const key = `${name}|${tint}`;
  if (!painted.has(key)) {
    const of = named(name);
    const made = of && sheet(of.w, of.h);
    if (of && made) {
      of.paint(painter(made.ctx), tint);
      outline(made.ctx, 0, 0, of.w, of.h, of.ink);
    }
    painted.set(key, made?.canvas);
  }
  return painted.get(key);
}

/** A sprite's height in art pixels, for the depth order. */
export const spriteHeight = (name: string) => named(name)?.h ?? TILE;
