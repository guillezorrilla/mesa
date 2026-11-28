// The marks a speech bubble shows, as maps of pixels: 'x' is drawn in the bubble's own colour.

export type PixelMap = readonly string[];

/** 7 by 7 each. */
export const EMOTES = {
  pencil: ['.....xx', '....xxx', '...xxx.', '..xxx..', '.xxx...', 'xxx....', 'xx.....'],
  book: ['.......', 'xx...xx', 'x.x.x.x', 'x..x..x', 'x..x..x', 'xxxxxxx', '.......'],
  terminal: ['xxxxxxx', 'x.....x', 'x.x...x', 'x..x..x', 'x.x.x.x', 'x.....x', 'xxxxxxx'],
  search: ['.xxx...', 'x...x..', 'x...x..', 'x...x..', '.xxx...', '....xx.', '.....xx'],
  team: ['.x...x.', 'xxx.xxx', '.x...x.', '.......', '..xxx..', '.xxxxx.', '.xxxxx.'],
  dots: ['.......', '.......', '.......', 'x..x..x', '.......', '.......', '.......'],
  alert: ['..xxx..', '..xxx..', '..xxx..', '..xxx..', '.......', '..xxx..', '..xxx..'],
  question: ['.xxxxx.', 'xx...xx', '....xx.', '...xx..', '...xx..', '.......', '...xx..'],
  sleep: ['xxxxxx.', '....xx.', '...xx..', '..xx...', '.xx....', 'xxxxxx.', '.......'],
  check: ['.......', '......x', '.....xx', 'x...xx.', 'xx.xx..', '.xxx...', '..x....'],
  cross: ['x.....x', 'xx...xx', '.xx.xx.', '..xxx..', '.xx.xx.', 'xx...xx', 'x.....x'],
  hourglass: ['xxxxxxx', '.x...x.', '..x.x..', '...x...', '..x.x..', '.xxxxx.', 'xxxxxxx'],
  stop: ['.......', '.xxxxx.', '.xxxxx.', '.xxxxx.', '.xxxxx.', '.xxxxx.', '.......'],
} as const satisfies Record<string, PixelMap>;
export type Emote = keyof typeof EMOTES;
