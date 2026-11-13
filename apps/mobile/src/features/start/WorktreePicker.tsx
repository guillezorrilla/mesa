import type { CallResult } from '@mesa/core/phone';
import { Suspense, use } from 'react';
import { BusyLine } from '@/components/BusyLine';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { useMacRead } from '../mac/useMacRead';

type Props = { project: string; value?: string; onChange: (path: string) => void };

/** `project`'s linked worktrees by branch, one to run in; key it by project. */
export function WorktreePicker(props: Props) {
  const { answer } = useMacRead({ method: 'worktrees', project: props.project });
  return (
    <Suspense fallback={<BusyLine label="Asking for its worktrees..." />}>
      <WorktreeChips worktrees={answer} {...props} />
    </Suspense>
  );
}

function WorktreeChips({
  worktrees,
  value,
  onChange,
}: Props & { worktrees: Promise<MacRead<CallResult<'worktrees'>>> }) {
  const { result, error } = use(worktrees);
  if (error) return <ErrorNote text={error} />;
  const listed = result?.worktrees ?? [];
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
