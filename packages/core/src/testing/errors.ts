import { MesaError } from '../lib/result.js';

/** The MesaError a call throws, as `{ code, message }`; throws if it returns or throws anything else. */
export function thrown(fn: () => unknown): { code: string; message: string } {
  try {
    fn();
  } catch (error) {
    if (error instanceof MesaError) return { code: error.code, message: error.message };
    throw error;
  }
  throw new Error('expected a MesaError');
}
