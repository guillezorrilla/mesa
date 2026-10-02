import { ActionDialog } from '@/components/ActionDialog';

/** Scripts a project's mesa.yaml names that this profile has not approved, by script. */
export type PendingScripts = [string, { argv: string[]; fingerprint: string }][];

/** Shows a project's unapproved worktree scripts exactly, word by word, for approval. */
export function ApproveScriptsDialog(props: {
  project: string;
  scripts: PendingScripts;
  busy: boolean;
  onApprove: () => void;
  onCancel: () => void;
}) {
  return (
    <ActionDialog
      testId="approve-scripts"
      title={`Approve ${props.project}'s worktree scripts?`}
      description="Mesa runs each one without a shell, as written, in every new worktree or before one is removed. Approve them only if you trust this repository."
      submit={{ label: 'Approve', testId: 'approve-scripts-submit', disabled: props.busy }}
      onCancel={props.onCancel}
      onSubmit={props.onApprove}
    >
      {props.scripts.map(([script, { argv }]) => (
        <div key={script} className="space-y-1">
          <p className="text-sm">{script === 'setup' ? 'Bootstrap' : 'Teardown'}</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {argv.map((word) => JSON.stringify(word)).join(' ')}
          </pre>
        </div>
      ))}
    </ActionDialog>
  );
}
