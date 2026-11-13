import type { WatchedSession } from '@mesa/core/phone';

/** What the app sends the terminal's page (bridge.js). */
export type ToPage =
  | { type: 'init'; data: string }
  | { type: 'write'; data: string }
  | { type: 'bottom' };

/** What the terminal's page sends the app (bridge.js). */
export type FromPage =
  | { type: 'size'; cols: number; rows: number }
  | { type: 'away'; away: boolean }
  | { type: 'copy'; text: string };

/** A message from the page; none for anything else a page could post. */
export function fromPage(raw: string): FromPage | undefined {
  try {
    const message = JSON.parse(raw) as FromPage;
    return ['size', 'away', 'copy'].includes(message?.type) ? message : undefined;
  } catch {
    return undefined;
  }
}

type Stream = NonNullable<WatchedSession['stream']>;

/**
 * What a pushed piece of the stream does to a terminal drawn up to byte `at` of the log: one that
 * starts there is written; one that ends by `at` was drawn already; any other, or a skip to the
 * log's end (no data), means some was missed or the log was cut, and the screen is read again.
 */
export function streamStep(at: number, stream: Stream): 'write' | 'drawn' | 'reload' {
  if (stream.from === at) return stream.to > at ? 'write' : 'drawn';
  if (stream.data && stream.to <= at) return 'drawn';
  return 'reload';
}

/** Output log lines as a terminal draws them, for a Mac that sends no screen. */
export const linesText = (lines: string[]) => lines.join('\r\n');
