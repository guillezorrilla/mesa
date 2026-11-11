import { ActionDialog } from '@/components/ActionDialog';

const SCRIPT_LABELS: Record<string, string> = {
  setup: 'Bootstrap',
  teardown: 'Teardown',
  check: 'Check',
};

/** Scripts a project's mesa.yaml names that this profile has not approved, by script. */
export type PendingScripts = [string, { argv: string[]; fingerprint: string }][];

/** Shows a project's unapproved worktree scripts and check exactly, word by word, for approval. */
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
      title={`Approve ${props.project}'s scripts?`}
      description="Mesa runs Bootstrap and Teardown without a shell, as written, in every new worktree or before one is removed, and Check in a shell when an agent or you run it. Approve them only if you trust this repository."
      submit={{ label: 'Approve', testId: 'approve-scripts-submit', disabled: props.busy }}
      onCancel={props.onCancel}
      onSubmit={props.onApprove}
    >
      {props.scripts.map(([script, { argv }]) => (
        <div key={script} className="space-y-1">
          <p className="text-sm">{SCRIPT_LABELS[script] ?? script}</p>
          <pre className="overflow-x-auto rounded-md border bg-muted/40 p-2 font-mono text-xs">
            {argv.map((word) => JSON.stringify(word)).join(' ')}
          </pre>
        </div>
      ))}
    </ActionDialog>
  );
}
