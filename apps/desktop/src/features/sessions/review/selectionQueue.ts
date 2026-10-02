const selectionQueues = new Map<string, Promise<unknown>>();

/**
 * Runs `task` after every earlier one for the same session has settled, so a session's page
 * selection is registered and cleared in the order asked.
 */
export function queueSelection<T>(sessionId: string, task: () => Promise<T>): Promise<T> {
  const next = (selectionQueues.get(sessionId) ?? Promise.resolve())
    .catch(() => undefined)
    .then(task);
  selectionQueues.set(sessionId, next);
  void next
    .finally(() => {
      if (selectionQueues.get(sessionId) === next) selectionQueues.delete(sessionId);
    })
    .catch(() => undefined);
  return next;
}
