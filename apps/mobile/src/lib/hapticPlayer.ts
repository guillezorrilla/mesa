/**
 * iOS's haptic vocabulary as Mesa uses it: a notification when an action lands (success), was
 * held back (warning: a guardrail, a stale prompt, a conflict) or failed (error), and selection
 * when a choice or tab changes. Nothing plays on an ordinary tap.
 */
export type Feel = 'success' | 'warning' | 'error' | 'selection';

/** What plays a feel: the Taptic Engine in the app, a recorder in tests. */
export type HapticEngine = {
  /** Whether the person left haptics on. */
  on: () => boolean;
  notify: (type: Exclude<Feel, 'selection'>) => Promise<void>;
  select: () => Promise<void>;
};

/** Plays `feel` unless haptics are off; a failed play is ignored, it is only feedback. */
export const hapticPlayer =
  (engine: HapticEngine) =>
  (feel: Feel): void => {
    if (!engine.on()) return;
    (feel === 'selection' ? engine.select() : engine.notify(feel)).catch(() => undefined);
  };
