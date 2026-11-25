import type { CloudErrorGroup, CloudLogEntry, CopyFormat } from '@mesa/core';
import { cloudCopyText, cloudGroupSummary } from '@mesa/core/browser';
import { useCallback } from 'react';
import { useCopy } from '../shared/useCopy';

/**
 * Copy on Cloud Logs through the shared copy (useCopy): entries as cloudCopyText writes them, a
 * group's summary, or a text such as a query or a Cloud Console link. Masking is for the model, not
 * the person's own clipboard. Stable callbacks.
 */
export function useCloudCopy() {
  const { put } = useCopy('Cloud Logs');
  const copy = useCallback(
    (entries: readonly CloudLogEntry[], format: CopyFormat) =>
      put(
        cloudCopyText(entries, format),
        entries.length === 1 ? 'the entry' : `${entries.length} entries`,
      ),
    [put],
  );
  const copySummary = useCallback(
    (group: CloudErrorGroup, entries: readonly CloudLogEntry[]) =>
      put(cloudGroupSummary(group, entries), 'the summary'),
    [put],
  );
  return { copy, copySummary, copyText: put };
}
