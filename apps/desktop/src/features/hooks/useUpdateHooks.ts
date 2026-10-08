import { CODEX_REVIEW_TITLE } from '@mesa/core/browser';
import { useCallback } from 'react';
import type { Message } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

/** The Codex note as one alert, for a place with no room to show it as a card or a dialog. */
export const codexReviewMessage = (review: string): Message => ({
  text: `${CODEX_REVIEW_TITLE}. ${review}`,
  tone: 'alert',
});

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
