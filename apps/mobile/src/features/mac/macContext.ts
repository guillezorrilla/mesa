import { createContext } from 'react';
import type { MacLink } from './macLink';

/** The line to the paired Mac; undefined while unpaired. */
export const MacContext = createContext<MacLink | undefined>(undefined);
