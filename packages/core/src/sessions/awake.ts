import type { SessionRow } from './board/rows.js';

// Keep awake (CONTEXT.md): whether the app holds an idle-sleep assertion, by `sessions.keepAwake`.

export const KEEP_AWAKE_MODES = ['off', 'on', 'working'] as const;
export type KeepAwakeMode = (typeof KEEP_AWAKE_MODES)[number];

/** How Settings names each mode. */
export const KEEP_AWAKE_LABELS: Record<KeepAwakeMode, string> = {
  off: 'Off',
  on: 'On',
  working: 'While agents work',
};

export const isKeepAwakeMode = (value: string): value is KeepAwakeMode =>
  (KEEP_AWAKE_MODES as readonly string[]).includes(value);

/** How many of `rows` are Mesa sessions whose agent is working now. */
export const workingCount = (rows: readonly SessionRow[]) =>
  rows.filter((row) => row.managed && row.lastState.state === 'working').length;

/** Whether the Mac should stay awake: always with `on`, while a session works with `working`. */
export const wantsAwake = (mode: KeepAwakeMode, rows: readonly SessionRow[]) =>
  mode === 'on' || (mode === 'working' && workingCount(rows) > 0);

/** What `mesa awake` prints: the mode, whether it wants the Mac awake now, and the working count. */
export const awakeStatus = (mode: KeepAwakeMode, rows: readonly SessionRow[]) => ({
  mode,
  wanted: wantsAwake(mode, rows),
  working: workingCount(rows),
});
