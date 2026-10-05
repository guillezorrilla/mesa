import { expect, test } from 'vitest';
import { type WheelDeps, wheelForwarder, wheelLines, wheelReports } from './terminalWheel';

const PX = 0;
const LINE = 1;
const PAGE = 2;

test('trackpad pixels become rows at the default speed, the fraction carried', () => {
  expect(wheelLines({ deltaY: 48, deltaMode: PX }, 16, 40, 3, 0)).toEqual({ lines: 3, carry: 0 });
  const first = wheelLines({ deltaY: 10, deltaMode: PX }, 16, 40, 3, 0);
  expect(first.lines).toBe(0);
  const second = wheelLines({ deltaY: 10, deltaMode: PX }, 16, 40, 3, first.carry);
  expect(second.lines).toBe(1);
  expect(second.carry).toBeCloseTo(0.25);
});

test('scroll speed scales the travel, and upward is negative', () => {
  expect(wheelLines({ deltaY: -32, deltaMode: PX }, 16, 40, 6, 0).lines).toBe(-4);
});

test('line and page modes count lines and screens, at most a screen a call', () => {
  expect(wheelLines({ deltaY: 3, deltaMode: LINE }, 16, 40, 3, 0).lines).toBe(3);
  expect(wheelLines({ deltaY: 1, deltaMode: PAGE }, 16, 40, 3, 0).lines).toBe(40);
  expect(wheelLines({ deltaY: 5000, deltaMode: PX }, 16, 40, 3, 0).lines).toBe(40);
  expect(wheelLines({ deltaY: -2, deltaMode: PAGE }, 16, 40, 3, 0).lines).toBe(-40);
});

test('reports are SGR wheel presses at the cell, one per line', () => {
  expect(wheelReports(-2, 10, 5)).toBe('\x1b[<64;10;5M\x1b[<64;10;5M');
  expect(wheelReports(1, 1, 1)).toBe('\x1b[<65;1;1M');
  expect(wheelReports(0, 1, 1)).toBe('');
});

/** Forwarder deps over a 100x40 screen of 8x16px cells; frames run when `next()` is called. */
function fakeDeps(view: { mouse: boolean; alternate?: boolean }) {
  const sent: string[] = [];
  const queued: (() => void)[] = [];
  const deps: WheelDeps = {
    view: () => ({
      alternate: false,
      ...view,
      rows: 40,
      cols: 100,
      box: { left: 0, top: 0, width: 800, height: 640 },
    }),
    speed: () => 3,
    send: (reports) => sent.push(reports),
    frames: { request: (run) => queued.push(run), cancel: () => queued.splice(0) },
  };
  const next = () => {
    for (const run of queued.splice(0)) run();
  };
  return { deps, sent, next };
}

/** A wheel event `deltaY` pixels at (85, 40): column 11, row 3. */
const wheelAt = (deltaY: number) => {
  let prevented = false;
  return {
    event: {
      deltaY,
      deltaMode: 0,
      clientX: 85,
      clientY: 40,
      preventDefault: () => {
        prevented = true;
      },
    },
    prevented: () => prevented,
  };
};

test('with mouse reporting on, one frame of travel goes to tmux in one send, at the pointer', () => {
  const { deps, sent, next } = fakeDeps({ mouse: true });
  const wheel = wheelForwarder(deps);
  const first = wheelAt(-32);
  expect(wheel.onWheel(first.event)).toBe(false);
  expect(first.prevented()).toBe(true);
  wheel.onWheel(wheelAt(-16).event);
  expect(sent).toEqual([]);
  next();
  // 48px at 16px rows: three rows up.
  expect(sent).toEqual([wheelReports(-3, 11, 3)]);
  // A frame cancelled on dispose sends nothing.
  wheel.onWheel(wheelAt(16).event);
  wheel.dispose();
  next();
  expect(sent).toHaveLength(1);
});

test('without mouse reporting xterm scrolls its own buffer, but never sends arrows to an agent', () => {
  const normal = fakeDeps({ mouse: false });
  expect(wheelForwarder(normal.deps).onWheel(wheelAt(-16).event)).toBe(true);
  const alternate = fakeDeps({ mouse: false, alternate: true });
  expect(wheelForwarder(alternate.deps).onWheel(wheelAt(-16).event)).toBe(false);
  normal.next();
  alternate.next();
  expect([...normal.sent, ...alternate.sent]).toEqual([]);
});
