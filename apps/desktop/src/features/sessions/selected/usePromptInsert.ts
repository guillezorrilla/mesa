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
  /** Inserts text without opening the menu; false when the session shows no prompt field. */
  const putPrompt = useCallback(
    (text: string) => {
      if (!promptField.current) return false;
      insertPrompt(text);
      return true;
    },
    [insertPrompt],
  );
  /** Opens the Session actions menu the field sits in. */
  const showPrompt = useCallback(() => {
    if (actionsMenu.current) actionsMenu.current.open = true;
  }, []);
  useEffect(() => {
    if (!request || request === handledPromptInsert.current || request.session !== selectedId)
      return;
    // A request the app sends shows the field, so the inserted text shows.
    if (!putPrompt(request.text)) return;
    showPrompt();
    handledPromptInsert.current = request;
  }, [request, selectedId, putPrompt, showPrompt]);
  return { promptField, actionsMenu, insertPrompt, putPrompt, showPrompt };
}

/** What `usePromptInsert` returns. */
export type PromptInsert = ReturnType<typeof usePromptInsert>;
