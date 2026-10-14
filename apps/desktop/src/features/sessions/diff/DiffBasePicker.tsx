import { ChevronDown } from 'lucide-react';
import { PickMenu } from '@/components/PickMenu';
import { useCommand } from '@/lib/useCommand';

/**
 * The ref a session's changes are compared with, as a menu of the checkout's remote branches and
 * its own; picking one compares with it instead.
 */
export function DiffBasePicker(props: {
  project: string;
  checkout: string;
  base: string;
  onPick: (base: string) => void;
}) {
  const branches = useCommand('git.branches', {
    project: props.project,
    checkout: props.checkout,
  });
  const refs = [
    ...new Set([
      props.base,
      ...(branches.data?.remotes ?? []),
      ...(branches.data?.branches ?? []).map((branch) => branch.name),
    ]),
  ];
  return (
    <PickMenu
      label="Compare with"
      search="Search branches"
      empty={
        branches.error ? `Could not list branches: ${branches.error.message}` : 'No branch matches.'
      }
      items={refs.map((ref) => ({ value: ref, name: ref }))}
      picked={[props.base]}
      onPick={props.onPick}
      trigger={
        <button
          type="button"
          aria-label={`Compare with ${props.base}`}
          className="inline-flex items-center gap-0.5 rounded px-1 font-mono text-foreground hover:bg-accent"
        >
          {props.base}
          <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
        </button>
      }
    />
  );
}
