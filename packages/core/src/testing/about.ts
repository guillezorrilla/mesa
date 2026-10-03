import { readFileSync } from 'node:fs';
import type { ReleaseBuild } from '../about/about.js';

/** An invented attributions file (`about/fixtures`): one entry per source, `tauri` among them. */
const ATTRIBUTIONS = new URL('../about/fixtures/attributions.json', import.meta.url);

/** A release build's assets as the single executable carries them: build 512 and `attributions`. */
export const fakeRelease = (attributions = readFileSync(ATTRIBUTIONS, 'utf8')): ReleaseBuild => ({
  build: '512',
  attributions: () => attributions,
});
