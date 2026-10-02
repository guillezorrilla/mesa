import { useCallback, useEffect, useRef } from 'react';

/**
 * Puts text at the cursor of the selected session's prompt field: a saved prompt picked beside it,
 * or one the app sends (`request`), inserted once when its session is the one selected.
 */
export function usePromptInsert(
  request: { session: string; text: string } | undefined,
  selectedId: string | undefined,
) {
  const promptField = useRef<HTMLTextAreaElement>(null);
  const actionsMenu = useRef<HTMLDetailsElement>(null);
  const handledPromptInsert = useRef<typeof request>(undefined);
  const insertPrompt = useCallback((text: string) => {
    const field = promptField.current;
    if (!field) return;
    field.setRangeText(text, field.selectionStart, field.selectionEnd, 'end');
    field.focus();
  }, []);
  useEffect(() => {
    if (!request || request === handledPromptInsert.current || request.session !== selectedId)
      return;
    if (!promptField.current) return;
    // The field sits in the Session actions menu: open it, so the inserted text shows.
    if (actionsMenu.current) actionsMenu.current.open = true;
    insertPrompt(request.text);
    handledPromptInsert.current = request;
  }, [request, selectedId, insertPrompt]);
  return { promptField, actionsMenu, insertPrompt };
}

/** What `usePromptInsert` returns. */
export type PromptInsert = ReturnType<typeof usePromptInsert>;
