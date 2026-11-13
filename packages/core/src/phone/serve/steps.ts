import { firstLine, keep } from '../../agents/steps.js';
import { clip } from '../../lib/clip.js';
import type { NativeStep } from '../../sessions/native/responses.js';
import type { PhoneStep } from '../protocol/steps.js';

/** How many steps a detail carries at most, the newest; a long turn's older ones stay on the Mac. */
export const MAX_STEPS = 60;
/** How long a row's one line may be. */
const LINE = 160;

/**
 * The steps among a detail's `count` newest replies (newest first, as `responses` reads them), each
 * cut to its row: what it is and its one line, never its output, hunk or whole thought, which the
 * `step` call reads when the row opens. ponytail: the newest MAX_STEPS only; page them if a turn's
 * earlier steps are missed.
 */
export function phoneSteps(steps: NativeStep[], count: number): PhoneStep[] {
  return steps
    .filter((step) => step.newer <= count)
    .slice(0, MAX_STEPS)
    .map((step) => {
      const placed = { id: step.id, newer: step.newer };
      if (step.type === 'thought')
        return { type: 'thought', ...placed, line: clip(firstLine(step.text), LINE) };
      if (step.type === 'edit')
        return {
          type: 'edit',
          ...placed,
          path: step.path,
          added: step.added,
          removed: step.removed,
          status: step.status,
        };
      return {
        type: 'tool',
        ...placed,
        kind: step.kind,
        name: step.name,
        target: clip(step.target, LINE),
        status: step.status,
      };
    });
}

/** A step's whole text, as its opened row shows it: a tool's output, an edit's hunk, a thought. */
export const stepText = (step: NativeStep) =>
  keep(
    step.type === 'tool' ? step.output : step.type === 'edit' ? step.hunk.join('\n') : step.text,
  );
