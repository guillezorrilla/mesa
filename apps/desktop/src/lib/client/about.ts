import type { About } from '@mesa/core';
import { command } from './spec';

/** Mesa's version, build, links and attributions; the attributions file stays in the CLI. */
export const aboutCommands = {
  about: command<About>('about'),
};
