import type { CopyFormat, ErrorGroup, ServerLogEntry } from '@mesa/core';
import { copyText, groupSummaryText } from '@mesa/core/browser';
import { useCallback, useRef } from 'react';
import { useToast } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * Copies log entries to the person's pasteboard as `copyText` writes them, or a group as its
 * summary, and says so in a toast; `source` names where they came from. Stable callbacks.
 */
export function useCopy(source: string) {
  const toast = useToast();
  const { clipboard } = usePlatform();
  const latest = useRef({ source, toast, clipboard });
  latest.current = { source, toast, clipboard };
  const put = useCallback((text: string, what: string) => {
    const { clipboard, toast } = latest.current;
    void clipboard.write(text).then(() => toast(`Copied ${what}`, 'confirmation'));
  }, []);
  const copy = useCallback(
    (entries: readonly ServerLogEntry[], format: CopyFormat) =>
      put(
        copyText(entries, format, { source: latest.current.source }),
        entries.length === 1 ? 'the line' : `${entries.length} lines`,
      ),
    [put],
  );
  const copyGroup = useCallback(
    (group: ErrorGroup<ServerLogEntry>) =>
      put(groupSummaryText(group, { source: latest.current.source }), 'the summary'),
    [put],
  );
  return { copy, copyGroup };
}
