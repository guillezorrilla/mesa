import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Input } from '@/components/ui/input';
import type { CloudFilters } from '@/lib/client/logs';

/** Names the filters (or a query Ask ran) as a saved view; a view of the same name is replaced. */
export function SaveViewDialog(props: {
  filters: CloudFilters;
  onSave: (name: string) => void;
  onCancel: () => void;
}) {
  const [name, setName] = useState('');
  const what = [
    props.filters.env,
    ...(props.filters.services ?? []),
    props.filters.severity,
    props.filters.text,
    props.filters.filter,
  ]
    .filter(Boolean)
    .join(' · ');
  return (
    <ActionDialog
      testId="save-view-dialog"
      title="Save as view"
      description={what || 'Every service in every project.'}
      submit={{ label: 'Save view', testId: 'confirm-save-view', disabled: !name.trim() }}
      onSubmit={() => props.onSave(name.trim())}
      onCancel={props.onCancel}
    >
      <Input
        aria-label="View name"
        placeholder="prod checkout errors"
        maxLength={60}
        autoFocus
        value={name}
        onChange={(event) => setName(event.currentTarget.value)}
      />
    </ActionDialog>
  );
}
