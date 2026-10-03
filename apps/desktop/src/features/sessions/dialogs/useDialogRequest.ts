import type { ManagedRow, TreeRow } from '@mesa/core';
import { useEffect, useRef } from 'react';
import type { OpenDialog } from './SessionDialogs';

/**
 * Opens `kind`'s dialog on Mesa sessions once for each request the app sends (a new `count`):
 * Archive on every requested session listed, Dependency on the first.
 */
export function useDialogRequest(
  request: { count: number; ids: string[] } | undefined,
  rows: TreeRow[] | undefined,
  kind: 'archive' | 'dependency',
  openDialog: (dialog: OpenDialog) => void,
) {
  const handled = useRef(0);
  useEffect(() => {
    const found = (request?.ids ?? []).flatMap((id) =>
      (rows ?? []).filter(
        (session): session is ManagedRow & TreeRow => session.id === id && session.managed,
      ),
    );
    const [row] = found;
    if (row && request?.count !== handled.current) {
      handled.current = request?.count ?? 0;
      openDialog(kind === 'archive' ? { kind, rows: found } : { kind, row });
    }
  }, [request, rows, kind, openDialog]);
}
