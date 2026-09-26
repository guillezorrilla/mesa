import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Class names joined, later Tailwind utilities winning over earlier ones (shadcn/ui's helper). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
