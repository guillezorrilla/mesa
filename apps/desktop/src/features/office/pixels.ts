// Drawing art pixel by pixel on a canvas: the Office's art is code, with no image files.

export type Ctx = CanvasRenderingContext2D;
/** Paints one colour's rectangle, in art pixels. */
export type Rect = (color: string, x: number, y: number, w?: number, h?: number) => void;

/** A canvas of `w` by `h` art pixels with its context; none where a canvas cannot draw (tests). */
export function sheet(w: number, h: number): { canvas: HTMLCanvasElement; ctx: Ctx } | undefined {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext?.('2d');
  return ctx ? { canvas, ctx } : undefined;
}

/** A painter of rectangles on `ctx`, from the corner (`ox`, `oy`). */
export const painter =
  (ctx: Ctx, ox = 0, oy = 0): Rect =>
  (color, x, y, w = 1, h = 1) => {
    ctx.fillStyle = color;
    ctx.fillRect(ox + x, oy + y, w, h);
  };

/** `hex` darkened (`by` under 1) or lightened (over 1). */
export function shade(hex: string, by: number) {
  const channel = (at: number) =>
    Math.max(0, Math.min(255, Math.round(Number.parseInt(hex.slice(at, at + 2), 16) * by)))
      .toString(16)
      .padStart(2, '0');
  return `#${channel(1)}${channel(3)}${channel(5)}`;
}

/** Rings what is drawn in the box with a one-pixel line, the way a sprite is outlined. */
export function outline(ctx: Ctx, x: number, y: number, w: number, h: number, color: string) {
  const image = ctx.getImageData(x, y, w, h);
  const solid = (px: number, py: number) =>
    px >= 0 && py >= 0 && px < w && py < h && (image.data[(py * w + px) * 4 + 3] as number) > 0;
  ctx.fillStyle = color;
  for (let py = 0; py < h; py++)
    for (let px = 0; px < w; px++)
      if (
        !solid(px, py) &&
        (solid(px - 1, py) || solid(px + 1, py) || solid(px, py - 1) || solid(px, py + 1))
      )
        ctx.fillRect(x + px, y + py, 1, 1);
}
