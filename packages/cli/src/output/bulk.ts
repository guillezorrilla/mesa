import { EXIT_CODES } from '@mesa/core';

/**
 * A bulk command's exit code (CONTEXT.md, Bulk command): 2 when any item failed, else 0. Its
 * envelope reports every item either way.
 */
export const bulkExit = (anyFailed: boolean) => (anyFailed ? EXIT_CODES.usage : EXIT_CODES.ok);
