import type { WorktreePreview } from '@mesa/core';
import { ActionDialog } from '@/components/ActionDialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';

/**
 * The confirmation a preview needs: what the action does, and, for a remove with local work, what
 * it would lose, with Delete anyway; an action the preview refuses says why, with nothing to apply.
 */
export function WorktreeDialog(props: {
  name: string;
  preview: WorktreePreview;
  busy: boolean;
  deleteBranch: boolean;
  onDeleteBranch: (on: boolean) => void;
  onConfirm: (force: boolean) => void;
  onCancel: () => void;
}) {
  const { preview } = props;
  const force = !preview.allowed && preview.forceable;
  const blocked = !preview.allowed && !preview.forceable;
  const title =
    preview.action === 'cleanup'
      ? 'Clean up missing worktrees?'
      : preview.action === 'recycle'
        ? `Recycle ${props.name}?`
        : force
          ? 'Worktree has unsaved work'
          : `Remove ${props.name}?`;
  const description =
    preview.action === 'cleanup'
      ? `Git forgets ${preview.paths.length} worktree(s) whose folders are gone.`
      : preview.action === 'recycle'
        ? `Resets it to ${preview.base ?? 'the default branch'}, detached, for a new session.${preview.branch ? ` Branch ${preview.branch} stays.` : ''}`
        : force
          ? `Removing ${props.name} loses what is listed below.`
          : `Its folder goes; ${preview.branch ? `branch ${preview.branch}` : 'its branch'} stays.`;
  return (
    <ActionDialog
      testId="worktree-dialog"
      title={title}
      description={description}
      submit={{
        label: force
          ? 'Delete anyway'
          : preview.action === 'recycle'
            ? 'Recycle'
            : preview.action === 'cleanup'
              ? 'Clean up'
              : 'Remove',
        testId: 'worktree-confirm',
        disabled: blocked || props.busy,
        variant: preview.action === 'remove' ? 'destructive' : 'default',
      }}
      onSubmit={() => props.onConfirm(force)}
      onCancel={props.onCancel}
    >
      {!preview.allowed && (
        <ul data-testid="worktree-reasons" className="list-disc space-y-1 pl-5 text-sm">
          {preview.reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
          {force &&
            preview.changes.slice(0, 8).map((change) => (
              <li key={change} className="font-mono text-xs text-muted-foreground">
                {change}
              </li>
            ))}
        </ul>
      )}
      {preview.action === 'recycle' && preview.branch && !blocked && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="worktree-delete-branch"
            checked={props.deleteBranch}
            onCheckedChange={(on) => props.onDeleteBranch(on === true)}
          />
          <Label htmlFor="worktree-delete-branch">
            Also delete branch {preview.branch} if it is merged
          </Label>
        </div>
      )}
    </ActionDialog>
  );
}
