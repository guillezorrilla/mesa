// How a wheel or trackpad scroll becomes tmux wheel reports in a session terminal
// (docs/spikes/terminal-scrolling.md): xterm sends at most one report per wheel event, whatever
// it travelled, so the terminal counts rows itself and tmux scrolls one line per report.

/** WheelEvent's deltaMode values. */
const LINES = 1;
const PAGES = 2;
/** A row's height before the screen has a box to measure (the default 13px font's row). */
const ROW_PX = 16;

/**
 * The whole lines one wheel event scrolls, and the fraction carried to the next: its travel in
 * rows (pixels by `rowHeight`, lines as they are, pages by `rows`) times `scrollSpeed / 3`, so the
 * default speed follows the finger. At most `rows` either way, negative upward.
 */
export function wheelLines(
  event: { deltaY: number; deltaMode: number },
  rowHeight: number,
  rows: number,
  scrollSpeed: number,
  carry: number,
): { lines: number; carry: number } {
  const travel =
    event.deltaMode === PAGES
      ? event.deltaY * rows
      : event.deltaMode === LINES
        ? event.deltaY
        : event.deltaY / rowHeight;
  const total = carry + (travel * scrollSpeed) / 3;
  const whole = Math.trunc(total);
  return { lines: Math.max(-rows, Math.min(rows, whole)), carry: total - whole };
}

/** `lines` SGR wheel reports at cell `col`, `row` (1-based): up for negative, down for positive. */
export const wheelReports = (lines: number, col: number, row: number) =>
  `\x1b[<${lines < 0 ? 64 : 65};${col};${row}M`.repeat(Math.abs(lines));

/** The 1-based cell `at` falls in, along a box from `start` of `size` holding `count` cells. */
const cellAt = (at: number, start: number, size: number, count: number) =>
  size ? Math.min(count, Math.max(1, Math.floor(((at - start) * count) / size) + 1)) : 1;

/** What the session terminal shows now, read on each wheel event. */
export type WheelView = {
  /** tmux asked for mouse reports (xterm's mouse tracking is on). */
  mouse: boolean;
  /** An alternate screen is up, as an agent's TUI keeps one. */
  alternate: boolean;
  rows: number;
  cols: number;
  /** The screen's box on the page, when it has one. */
  box?: { left: number; top: number; width: number; height: number };
};

export type WheelDeps = {
  view: () => WheelView;
  /** The Scroll Speed preference now. */
  speed: () => number;
  /** Writes reports to the terminal's tmux client. */
  send: (reports: string) => void;
  /** Schedules work for the next frame (requestAnimationFrame in the app). */
  frames: { request: (run: () => void) => number; cancel: (id: number) => void };
};

/**
 * xterm's custom wheel handler for a session terminal: with mouse reporting on, it turns each
 * event's travel into reports at the pointer's cell and sends one frame's worth at once; with it
 * off, xterm scrolls its own buffer, except on an alternate screen, where xterm would turn the
 * wheel into arrow keys for the agent (Natural Mouse Selection), so nothing goes.
 */
export function wheelForwarder(deps: WheelDeps) {
  let carry = 0;
  let pending = '';
  let frame = 0;
  const flush = () => {
    frame = 0;
    const out = pending;
    pending = '';
    if (out) deps.send(out);
  };
  return {
    onWheel(
      event: Pick<WheelEvent, 'deltaY' | 'deltaMode' | 'clientX' | 'clientY' | 'preventDefault'>,
    ): boolean {
      const view = deps.view();
      if (!view.mouse) return !view.alternate;
      const { box } = view;
      const rowHeight = box?.height ? box.height / view.rows : ROW_PX;
      const step = wheelLines(event, rowHeight, view.rows, deps.speed(), carry);
      carry = step.carry;
      if (step.lines) {
        const col = box ? cellAt(event.clientX, box.left, box.width, view.cols) : 1;
        const row = box ? cellAt(event.clientY, box.top, box.height, view.rows) : 1;
        pending += wheelReports(step.lines, col, row);
        frame ||= deps.frames.request(flush);
      }
      event.preventDefault();
      return false;
    },
    dispose: () => deps.frames.cancel(frame),
  };
}
