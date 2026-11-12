import { readFileSync } from 'node:fs';
import { AGENT_STATES } from '@mesa/core/browser';
import { expect, test } from 'vitest';
import { stateTone } from './stateTone';

const css = readFileSync(new URL('../../style.css', import.meta.url), 'utf8');

/** The `--name: oklch(L C h)` tokens a selector's block sets, as [L, C, h]. */
function tokens(selector: string) {
  const start = css.indexOf(`${selector} {`);
  if (start < 0) throw new Error(`no ${selector} block`);
  const block = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries(
    [...block.matchAll(/--([\w-]+): oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)/g)].map((m) => [
      m[1],
      [Number(m[2]), Number(m[3]), Number(m[4])] as Colour,
    ]),
  );
}

type Colour = readonly [number, number, number];

/** WCAG relative luminance of an oklch colour (oklab, then linear sRGB clipped to its gamut). */
function luminance([L, C, h]: readonly [number, number, number]) {
  const [a, b] = [C * Math.cos((h * Math.PI) / 180), C * Math.sin((h * Math.PI) / 180)];
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const clip = (v: number) => Math.min(1, Math.max(0, v));
  const r = clip(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s);
  const g = clip(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s);
  const bl = clip(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s);
  return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
}
const contrast = (x: Colour, y: Colour) => {
  const [hi, lo] = [luminance(x), luminance(y)].sort((p, q) => q - p) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

test('each state has one colour, its own token, for words, icons and the bar', () => {
  const own = { working: 'working', idle: 'idle', done: 'done', failed: 'failed' } as const;
  for (const [state, token] of Object.entries(own)) {
    expect(stateTone(state as keyof typeof own).ink).toBe(`text-state-${token}`);
    expect(stateTone(state as keyof typeof own).fill).toBe(`bg-state-${token}`);
  }
  for (const state of ['waiting-permission', 'waiting-question'] as const) {
    expect(stateTone(state).ink).toBe('text-state-waiting');
    expect(stateTone(state).fill).toBe('bg-state-waiting');
  }
  // Mesa's own states stay uncoloured; every agent state has a tone.
  expect(stateTone('queued').ink).toBe('text-muted-foreground');
  expect(stateTone('stopped').ink).toBe('text-muted-foreground');
  for (const state of AGENT_STATES) expect(stateTone(state).ink).toMatch(/^text-/);
});

test('every state colour reads at 4.5:1 on the card and the background, light and dark, in each colour-vision mode', () => {
  const light = tokens(':root');
  const dark = { ...light, ...tokens(':root[data-theme="dark"]') };
  const modes = {
    light,
    dark,
    'light red-green': {
      ...light,
      ...tokens(':root[data-color-vision="red-green"]'),
      ...tokens(':root:not([data-theme="dark"])[data-color-vision="red-green"]'),
    },
    'dark red-green': { ...dark, ...tokens(':root[data-color-vision="red-green"]') },
    'light blue-yellow': {
      ...light,
      ...tokens(':root[data-color-vision="blue-yellow"]'),
      ...tokens(':root:not([data-theme="dark"])[data-color-vision="blue-yellow"]'),
    },
    'dark blue-yellow': { ...dark, ...tokens(':root[data-color-vision="blue-yellow"]') },
  };
  const short: string[] = [];
  for (const [mode, set] of Object.entries(modes)) {
    // The Crew panel sits on the card, the sidebar's worker rows on the background.
    for (const surface of ['card', 'background']) {
      const behind = set[surface];
      if (!behind) throw new Error(`no --${surface} in ${mode}`);
      for (const state of ['working', 'waiting', 'idle', 'done', 'failed']) {
        const colour = set[`state-${state}`];
        if (!colour) throw new Error(`no --state-${state} in ${mode}`);
        const ratio = contrast(colour, behind);
        if (ratio < 4.5) short.push(`${mode} ${surface} ${state} ${ratio.toFixed(2)}`);
      }
    }
  }
  expect(short).toEqual([]);
});
