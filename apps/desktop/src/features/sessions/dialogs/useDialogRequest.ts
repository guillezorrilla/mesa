import type { ManagedRow, TreeRow } from '@mesa/core';
import { useEffect, useRef } from 'react';
import type { OpenDialog } from './SessionDialogs';

/** Opens `kind`'s dialog on a Mesa session once for each request the app sends (a new `count`). */
export function useDialogRequest(
  request: { count: number; id: string } | undefined,
  rows: TreeRow[] | undefined,
  kind: 'archive' | 'dependency',
  openDialog: (dialog: OpenDialog) => void,
) {
  const handled = useRef(0);
  useEffect(() => {
    const id = request?.id;
    const row = rows?.find(
      (session): session is ManagedRow & TreeRow => session.id === id && session.managed,
    );
    if (row && request?.count !== handled.current) {
      handled.current = request?.count ?? 0;
      openDialog({ kind, row });
    }
  }, [request, rows, kind, openDialog]);
}
