import { Suspense, use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { ChoiceChips } from '@/components/ChoiceChips';
import { Text } from '@/components/ui/text';
import { useWorktrees, type Worktrees } from './useWorktrees';

type Props = { project: string; value?: string; onChange: (path: string) => void };

/** `project`'s linked worktrees by branch, one to run in; key it by project. */
export function WorktreePicker(props: Props) {
  const worktrees = useWorktrees(props.project);
  return (
    <Suspense fallback={<BusyLine label="Asking for its worktrees..." />}>
      <WorktreeChips worktrees={worktrees} {...props} />
    </Suspense>
  );
}

function WorktreeChips({ worktrees, value, onChange }: Props & { worktrees: Promise<Worktrees> }) {
  const listed = use(worktrees);
  if (!listed.length) return <Text variant="muted">This project has no other worktree.</Text>;
  return (
    <ChoiceChips
      label="Worktree"
      choices={listed.map((w) => [w.path, w.branch] as const)}
      value={value}
      onChange={onChange}
    />
  );
}
