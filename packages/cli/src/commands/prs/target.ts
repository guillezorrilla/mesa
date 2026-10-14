import type { Mesa } from '@mesa/core';
import { wholeNumber } from '../../input/flags.js';

/**
 * The PR a `prs draft`, `publish` or `verdict` names: `<project> <number>`, or only `<number>` from
 * inside a Mesa session, whose project it is.
 */
export function prTarget(mesa: Mesa, args: { project: string; number?: string | undefined }) {
  if (args.number === undefined)
    return { project: mesa.prs.callerProject(), number: wholeNumber(args.project, 'number') };
  return { project: args.project, number: wholeNumber(args.number, 'number') };
}
