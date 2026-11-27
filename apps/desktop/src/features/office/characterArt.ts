import { nameHash } from '@/lib/nameColor';
import { outline, painter, shade, sheet } from './pixels';

// The Office's characters: each a sheet of 16 by 32 frames painted from its look, three rows
// (facing down, up, right; left is right mirrored) of ten frames.

export const FRAME = { w: 16, h: 32 };
/** The frames of a row: three of a walk, then seated ones. */
export const FRAMES = {
  walk: [0, 1, 2, 1],
  type: [3, 4],
  read: [5, 6],
  wave: [7, 8],
  sit: [9],
} as const;
export const ROWS = { down: 0, up: 1, right: 2, left: 2 } as const;

const SKIN = ['#f6d3b3', '#e8b98f', '#c98f62', '#9a6843', '#6f4a2d'];
const HAIR = ['#2b2523', '#5b3a1e', '#a8651f', '#d9b25a', '#b9b9c4', '#b23a2e', '#3d2b55'];
const SHIRT = [
  '#3d7dd8',
  '#e0703c',
  '#3fa56a',
  '#c94f7c',
  '#8a5bd1',
  '#d9b23c',
  '#3aa7a3',
  '#d04a44',
];
const PANTS = ['#2f3b59', '#4a4038', '#3a3a44', '#5a6b8c'];
const INK = '#221a1c';
const SHOE = '#2a2430';
const PAPER = '#f1f1f4';

export type Look = { skin: string; hair: string; shirt: string; pants: string; style: number };

/**
 * How a session's character looks, the same on every look: its skin, hair and trousers from its
 * own id, and its shirt from its family's, so a parent and its children wear one colour.
 */
export function look(id: string, family: string): Look {
  const hash = nameHash(id);
  return {
    skin: SKIN[hash % SKIN.length] as string,
    hair: HAIR[(hash >>> 4) % HAIR.length] as string,
    shirt: SHIRT[nameHash(family) % SHIRT.length] as string,
    pants: PANTS[(hash >>> 8) % PANTS.length] as string,
    style: (hash >>> 12) % 4,
  };
}

const sheets = new Map<string, HTMLCanvasElement | undefined>();

/** `look`'s sheet, painted once; none where a canvas cannot draw. */
export function characterSheet(of: Look) {
  const key = JSON.stringify(of);
  if (!sheets.has(key)) sheets.set(key, paintSheet(of));
  return sheets.get(key);
}

function paintSheet(of: Look) {
  const made = sheet(FRAME.w * 10, FRAME.h * 3);
  if (!made) return undefined;
  for (let row = 0; row < 3; row++)
    for (let frame = 0; frame < 10; frame++) {
      const p = painter(made.ctx, frame * FRAME.w, row * FRAME.h);
      if (row === 2) side(p, of, frame);
      else front(p, of, frame, row === 1);
      outline(made.ctx, frame * FRAME.w, row * FRAME.h, FRAME.w, FRAME.h, INK);
    }
  return made.canvas;
}

type P = ReturnType<typeof painter>;

/** Facing the viewer, or away (`back`): the head is most of it, as in a top-down office. */
function front(p: P, of: Look, frame: number, back: boolean) {
  const { skin, hair, shirt, pants } = of;
  const step = frame < 3 ? frame - 1 : 0;
  const second = frame % 2 === 0;
  if (frame >= 3) {
    p(pants, 5, 25, 6, 2);
    p(SHOE, 5, 27, 2, 1);
    p(SHOE, 9, 27, 2, 1);
  } else {
    for (const [x, lift] of [
      [5, step > 0 ? 2 : 0],
      [8, step < 0 ? 2 : 0],
    ] as const) {
      p(pants, x, 25, 3, 4 - lift);
      p(SHOE, x, 29 - lift, 3, 2);
    }
  }
  p(shirt, 5, 18, 6, 7);
  p(shade(shirt, 0.78), 10, 18, 1, 7);
  const arm = (x: number, dy: number, tone: string) => {
    p(tone, x, 18 + dy, 1, 3);
    p(skin, x, 21 + dy, 1, 2);
  };
  const typing = frame === 3 || frame === 4;
  const reading = frame === 5 || frame === 6;
  const waving = frame === 7 || frame === 8;
  if (typing && back) {
    // Hands up on the keyboard, one after the other.
    for (const [x, up] of [
      [4, second],
      [11, !second],
    ] as const) {
      p(shirt, x, 17, 1, 2);
      p(skin, x, up ? 15 : 16, 1, 2);
    }
  } else {
    arm(4, step, shirt);
    if (waving && !back) {
      p(shirt, 11, 15, 2, 3);
      p(skin, second ? 13 : 12, 12, 2, 3);
    } else arm(11, -step, shade(shirt, 0.78));
  }
  if (typing && !back) {
    p(skin, 6, second ? 22 : 23, 1, 1);
    p(skin, 9, second ? 23 : 22, 1, 1);
  }
  if (reading && back) {
    p(PAPER, 12, second ? 15 : 14, 3, 4);
    p(skin, 11, 18, 1, 2);
  }
  if (reading && !back) {
    p(PAPER, 5, 20, 6, 4);
    p('#9aa1ad', 6, 21, 4, 1);
    p('#9aa1ad', 6, 23, second ? 4 : 3, 1);
  }
  p(skin, 4, 8, 8, 10);
  p(shade(skin, 0.86), 4, 17, 8, 1);
  if (!back) {
    p(skin, 3, 12, 1, 2);
    p(skin, 12, 12, 1, 2);
    p(INK, 6, 13, 1, 2);
    p(INK, 9, 13, 1, 2);
    p(shade(skin, 0.9), 5, 15, 1, 1);
    p(shade(skin, 0.9), 10, 15, 1, 1);
  }
  const dark = shade(hair, 0.75);
  const light = shade(hair, 1.25);
  if (back) {
    p(hair, 4, 6, 8, 10);
    p(hair, 3, 8, 1, 6);
    p(hair, 12, 8, 1, 6);
    p(dark, 4, 14, 8, 2);
    if (of.style === 1) {
      p(hair, 3, 8, 10, 12);
      p(dark, 3, 18, 10, 2);
    }
  } else {
    p(hair, 4, 6, 8, 3);
    p(hair, 3, 8, 1, 4);
    p(hair, 12, 8, 1, 4);
    p(hair, 4, 9, 2, 1);
    p(hair, 10, 9, 2, 1);
    if (of.style === 1) {
      p(hair, 3, 8, 1, 11);
      p(hair, 12, 8, 1, 11);
      p(dark, 2, 11, 1, 7);
      p(dark, 13, 11, 1, 7);
    }
  }
  p(light, 6, 6, 3, 1);
  if (of.style === 2)
    for (const [x, y] of [
      [4, 5],
      [6, 4],
      [7, 4],
      [9, 5],
      [11, 5],
    ] as const)
      p(hair, x, y, 1, 2);
  if (of.style === 3) {
    p(hair, 6, 3, 4, 3);
    p(light, 7, 3, 2, 1);
  }
}

/** Facing right. */
function side(p: P, of: Look, frame: number) {
  const { skin, hair, shirt, pants } = of;
  const step = frame < 3 ? frame - 1 : 0;
  const second = frame % 2 === 0;
  const far = shade(pants, 0.75);
  if (frame >= 3) {
    p(pants, 6, 25, 5, 2);
    p(SHOE, 9, 27, 3, 1);
  } else if (step === 0) {
    p(pants, 6, 25, 4, 4);
    p(SHOE, 6, 29, 5, 2);
  } else {
    p(step > 0 ? far : pants, 5, 25, 3, 4);
    p(SHOE, 4, 29, 3, 2);
    p(step > 0 ? pants : far, 9, 25, 3, 3);
    p(SHOE, 10, 28, 3, 2);
  }
  p(shirt, 6, 18, 5, 7);
  const sleeve = shade(shirt, 0.78);
  if (frame === 3 || frame === 4) {
    p(sleeve, 9, 19, 3, 2);
    p(skin, 12, second ? 19 : 20, 1, 2);
  } else if (frame === 5 || frame === 6) {
    p(sleeve, 9, 19, 2, 2);
    p(skin, 11, 20, 1, 2);
    p(PAPER, 12, second ? 16 : 15, 2, 5);
  } else if (frame === 7 || frame === 8) {
    p(sleeve, 9, 16, 2, 3);
    p(skin, second ? 11 : 10, 12, 2, 4);
  } else {
    p(sleeve, 7 + step, 18, 2, 3);
    p(skin, 7 + step, 21, 2, 2);
  }
  p(skin, 4, 8, 8, 10);
  p(shade(skin, 0.86), 4, 17, 8, 1);
  p(INK, 10, 13, 1, 2);
  p(shade(skin, 0.86), 12, 14, 1, 1);
  p(hair, 3, 6, 9, 3);
  p(hair, 3, 8, 4, 7);
  p(hair, 7, 9, 2, 1);
  p(shade(hair, 0.75), 3, 13, 4, 2);
  p(shade(hair, 1.25), 6, 6, 3, 1);
  if (of.style === 1) p(hair, 2, 8, 4, 12);
  if (of.style === 2)
    for (const [x, y] of [
      [4, 5],
      [6, 4],
      [8, 4],
      [10, 5],
    ] as const)
      p(hair, x, y, 1, 2);
  if (of.style === 3) p(hair, 1, 6, 3, 4);
}
