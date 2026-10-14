import { ChevronDown } from 'lucide-react';
import { type ComponentProps, useState } from 'react';
import { PickMenu } from '@/components/PickMenu';
import { useCommand } from '@/lib/useCommand';

type Props = {
  project: string;
  /** None: the project's main checkout. */
  checkout?: string | undefined;
  base: string;
  onPick: (base: string) => void;
};

/**
 * The ref a session's changes are compared with, as a menu of the checkout's remote branches and
 * its own; picking one compares with it instead. The branches are read once the menu is opened.
 */
export function DiffBasePicker(props: Props) {
  const [asked, setAsked] = useState(false);
  if (asked) return <BaseMenu {...props} />;
  return <Trigger base={props.base} onClick={() => setAsked(true)} />;
}

function BaseMenu(props: Props) {
  const branches = useCommand('git.branches', {
    project: props.project,
    ...(props.checkout ? { checkout: props.checkout } : {}),
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
      defaultOpen
      label="Compare with"
      search="Search branches"
      empty={
        branches.error ? `Could not list branches: ${branches.error.message}` : 'No branch matches.'
      }
      items={refs.map((ref) => ({ value: ref, name: ref }))}
      picked={[props.base]}
      onPick={props.onPick}
      trigger={<Trigger base={props.base} />}
    />
  );
}

function Trigger({ base, ...rest }: { base: string } & ComponentProps<'button'>) {
  return (
    <button
      type="button"
      aria-label={`Compare with ${base}`}
      className="inline-flex items-center gap-0.5 rounded px-1 font-mono text-foreground hover:bg-accent"
      {...rest}
    >
      {base}
      <ChevronDown aria-hidden className="size-3 text-muted-foreground" />
    </button>
  );
}
