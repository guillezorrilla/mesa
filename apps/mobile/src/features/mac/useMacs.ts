import { use } from 'react';
import { MacsContext } from './macsContext';

/** Every paired Mac, with the line to each. */
export const useMacs = () => use(MacsContext);
