import { createContext } from 'react';
import type { MacLink } from './macLink';

/** The line to the Mac a screen talks to; undefined while unpaired. */
export const MacContext = createContext<MacLink | undefined>(undefined);
