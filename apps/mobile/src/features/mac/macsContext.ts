import { createContext } from 'react';
import type { MacLink } from './macLink';

/** One paired Mac: its pairing id, what the phone calls it, and the line to it. */
export type Mac = { id: string; name: string; link: MacLink };

/** Every paired Mac, in the order they were paired. */
export const MacsContext = createContext<Mac[]>([]);
