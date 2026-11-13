import { useState } from 'react';
import { type LineSelection, tapLine } from './lineSelection';

/** The lines tapped so far; `tap` takes how a tap changes them, tapLine unless told otherwise. */
export function useLineSelection() {
  const [selection, setSelection] = useState<LineSelection>();
  const tap = (at: number, next = tapLine) => setSelection((last) => next(last, at));
  return { selection, tap };
}
