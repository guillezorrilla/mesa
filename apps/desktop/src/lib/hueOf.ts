const HUES = [18, 210, 145, 265, 40, 330, 185];

/** A stable hue for a name, so the same person or project always gets the same color. */
export const hueOf = (name: string) =>
  HUES[[...name].reduce((sum, c) => sum + c.charCodeAt(0), 0) % HUES.length];
