import type { ManagedRow, TreeRow } from '@mesa/core';
import { queued, sessionLabel } from '@mesa/core/browser';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';

/** Visual parent and queued start condition are independent links. */
export function DependencyDialog(props: {
  row: ManagedRow;
  rows: readonly TreeRow[];
  disabled: boolean;
  onSave: (change: { parent?: string | null; after?: string }) => void;
  onCancel: () => void;
}) {
  const [parent, setParent] = useState(props.row.parent ?? 'none');
  const [after, setAfter] = useState(props.row.after ?? '');
  const candidates = props.rows
    .filter((row): row is ManagedRow & TreeRow => row.managed && row.id !== props.row.id)
    .map((row) => {
      const label = sessionLabel(row);
      return { id: row.id, label: label === row.id ? row.id : `${label} (${row.id})` };
    });
  for (const id of [props.row.parent, props.row.after]) {
    if (id && !candidates.some((candidate) => candidate.id === id))
      candidates.push({ id, label: id });
  }
  const changed = parent !== (props.row.parent ?? 'none') || after !== (props.row.after ?? '');
  return (
    <ActionDialog
      testId="dependency-dialog"
      title={`Set dependency for ${sessionLabel(props.row)}`}
      description="Parent places a session in the tree. Starts after controls when a queued session launches. Changing either link does not change Git history."
      submit={{
        label: 'Save links',
        testId: 'dependency-submit',
        disabled: props.disabled || !changed,
      }}
      onSubmit={() =>
        props.onSave({
          ...(parent === (props.row.parent ?? 'none')
            ? {}
            : { parent: parent === 'none' ? null : parent }),
          ...(after === (props.row.after ?? '') ? {} : { after }),
        })
      }
      onCancel={props.onCancel}
    >
      <div className="grid gap-2">
        <Label htmlFor="dependency-parent">Parent in Sessions</Label>
        <NativeSelect
          id="dependency-parent"
          data-testid="dependency-parent"
          value={parent}
          onChange={(event) => setParent(event.target.value)}
        >
          <NativeSelectOption value="none">No parent</NativeSelectOption>
          {candidates.map((candidate) => (
            <NativeSelectOption key={candidate.id} value={candidate.id}>
              {candidate.label}
            </NativeSelectOption>
          ))}
        </NativeSelect>
      </div>
      {queued(props.row) && (
        <div className="grid gap-2">
          <Label htmlFor="dependency-after">Starts after</Label>
          <NativeSelect
            id="dependency-after"
            data-testid="dependency-after"
            value={after}
            onChange={(event) => setAfter(event.target.value)}
          >
            {candidates.map((candidate) => (
              <NativeSelectOption key={candidate.id} value={candidate.id}>
                {candidate.label}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </div>
      )}
    </ActionDialog>
  );
}
