import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Joins class names, the later Tailwind class winning a conflict (shadcn/ui's helper). */
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
