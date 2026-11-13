import type { MergeMethod, PrDetail } from '@mesa/core';
import { MERGE_LABELS, MERGE_METHODS } from '@mesa/core/browser';
import { GitMerge } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { SplitButton } from '@/components/SplitButton';
import { DropdownMenuCheckboxItem, DropdownMenuLabel } from '@/components/ui/dropdown-menu';

const CHECKS_SAY: Record<NonNullable<PrDetail['checks']> | 'none', string> = {
  passing: 'Its checks pass.',
  failing: 'Its checks are failing.',
  pending: 'Its checks are still running.',
  none: 'It has no checks.',
};

/**
 * Merges the PR through gh with the method picked in its menu, squash by default, after a confirm
 * that names the checks' state; with failing checks the confirm is the yes core asks for.
 */
export function MergeButton(props: {
  pr: Pick<PrDetail, 'number' | 'checks'>;
  onMerge: (method: MergeMethod, yes: boolean) => Promise<void>;
}) {
  const [method, setMethod] = useState<MergeMethod>('squash');
  const [confirming, setConfirming] = useState(false);
  const [merging, setMerging] = useState(false);
  const failing = props.pr.checks === 'failing';
  const merge = async () => {
    setMerging(true);
    await props.onMerge(method, failing);
    setMerging(false);
    setConfirming(false);
  };
  return (
    <>
      <SplitButton
        testId="merge-pr"
        menuTestId="merge-method"
        menuLabel="How to merge"
        variant="outline"
        onClick={() => setConfirming(true)}
        menu={
          <>
            <DropdownMenuLabel>Merge method</DropdownMenuLabel>
            {MERGE_METHODS.map((m) => (
              <DropdownMenuCheckboxItem
                key={m}
                data-testid={`merge-method-${m}`}
                checked={method === m}
                onCheckedChange={() => setMethod(m)}
              >
                {MERGE_LABELS[m]}
              </DropdownMenuCheckboxItem>
            ))}
          </>
        }
      >
        <GitMerge aria-hidden />
        {MERGE_LABELS[method]}
      </SplitButton>
      {confirming && (
        <ActionDialog
          testId="merge-pr-dialog"
          title={`${MERGE_LABELS[method]} #${props.pr.number}?`}
          description={`${CHECKS_SAY[props.pr.checks ?? 'none']} Mesa merges through gh, never past branch protection.`}
          submit={{
            label: failing ? 'Merge anyway' : MERGE_LABELS[method],
            testId: 'confirm-merge-pr',
            disabled: merging,
            ...(failing ? { variant: 'destructive' as const } : {}),
          }}
          onSubmit={() => void merge()}
          onCancel={() => setConfirming(false)}
        />
      )}
    </>
  );
}
