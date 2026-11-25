import type { CloudErrorGroup, CloudLogEntry, CopyFormat } from '@mesa/core';
import { cloudCopyText, cloudGroupSummary } from '@mesa/core/browser';
import { useToast } from '@/components/Toast';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * Copy on Cloud Logs: entries as cloudCopyText writes them, a group's summary, or a text such as a
 * query or a Cloud Console link, each said in a toast. Masking is for the model, not the person's
 * own clipboard.
 */
export function useCloudCopy() {
  const { clipboard } = usePlatform();
  const toast = useToast();
  const put = (text: string, what: string) =>
    void clipboard.write(text).then(() => toast(`Copied ${what}`, 'confirmation'));
  return {
    copy: (entries: readonly CloudLogEntry[], format: CopyFormat) =>
      put(
        cloudCopyText(entries, format),
        entries.length === 1 ? 'the entry' : `${entries.length} entries`,
      ),
    copySummary: (group: CloudErrorGroup, entries: readonly CloudLogEntry[]) =>
      put(cloudGroupSummary(group, entries), 'the summary'),
    copyText: put,
  };
}
