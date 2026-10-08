import { useCallback } from 'react';
import { useRun } from '@/lib/useCommand';

/** What the app says once after an update that changed Codex's hook commands. */
export const CODEX_REVIEW_TITLE = "Codex needs you to approve Mesa's updated hooks";

/**
 * Updates Mesa's hooks (`mesa hooks install`). When that changed Codex's hook commands, Codex
 * runs none of them until the person approves them, so the result carries core's hint on how
 * (`codexReview`); Mesa never writes Codex's trust itself.
 */
export function useUpdateHooks() {
  const run = useRun();
  return useCallback(async () => {
    const result = await run('hooks.install');
    return result && { result, codexReview: result.codex.changed ? result.codex.hint : undefined };
  }, [run]);
}
