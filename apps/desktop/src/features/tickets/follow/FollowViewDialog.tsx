import type { ViewInput } from '@mesa/core';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { FollowDialogFrame } from './FollowDialogFrame';
import { type Pick, ViewPicker } from './ViewPicker';

type Kind = 'current' | 'next' | 'filter' | 'jql';
const KINDS: readonly [Kind, string, string][] = [
  ['current', 'Current sprint', "A board's active sprint"],
  ['next', 'Next sprint', "What's planned next"],
  ['filter', 'Saved filter', 'A filter you keep in Jira'],
  ['jql', 'JQL query', 'Anything else'],
];

/** `base`, or `base 2`, `base 3`... until no view has the name. */
const freeName = (base: string, taken: readonly string[]) => {
  const used = new Set(taken.map((n) => n.toLowerCase()));
  for (let n = 1; ; n++) {
    const name = n === 1 ? base : `${base} ${n}`;
    if (!used.has(name.toLowerCase())) return name;
  }
};

/**
 * Follow a ticket view: one the profile defines already (another project's board, say), or a
 * new one picked by what it reads, with Only mine and Hide done, a live count of its tickets,
 * and the JQL Mesa sends under Advanced. A new view takes the name typed, else one after what it
 * reads.
 */
export function FollowViewDialog(props: {
  project: string;
  following: string[];
  onFollowed: () => void;
  onCancel: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const views = useCommand('tickets.views');
  const [kind, setKind] = useState<Kind>('current');
  const [picked, setPicked] = useState<Pick>();
  const [jql, setJql] = useState('');
  const [typedName, setTypedName] = useState('');
  const [checkedJql, setCheckedJql] = useState('');
  const [mine, setMine] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const filter = kind === 'filter';
  const query: Omit<ViewInput, 'name'> | undefined =
    kind === 'jql'
      ? checkedJql.trim()
        ? { jql: checkedJql.trim() }
        : undefined
      : picked && (filter ? { filter: picked.id } : { board: Number(picked.id), sprint: kind });
  const view = query && {
    ...query,
    ...(mine ? {} : { everyone: true }),
    ...(hideDone ? {} : { showDone: true }),
  };
  const others = (views.data ?? []).filter((v) => !props.following.includes(v.name));
  const suggested = freeName(
    kind === 'jql'
      ? 'JQL view'
      : filter
        ? (picked?.name ?? 'Saved filter')
        : `${picked?.name ?? 'Board'} ${kind === 'next' ? 'next sprint' : 'sprint'}`,
    (views.data ?? []).map((v) => v.name),
  );
  const name = typedName.trim() || suggested;
  // A typed name another view has is refused before Follow, not after.
  const taken = (views.data ?? []).find((v) => v.name.toLowerCase() === name.toLowerCase())?.name;
  const follow = (existing?: string) =>
    void act(async () => {
      const target =
        existing ?? (view && (await run('tickets.viewsAdd', { view: { name, ...view } }))?.name);
      if (target && (await run('tickets.follow', { project: props.project, view: target })))
        props.onFollowed();
      return undefined;
    });
  return (
    <FollowDialogFrame
      tracker="jira"
      title="Follow a Jira view"
      description="Its tickets show up in this tab and stay current as sprints change."
      view={view}
      name={name}
      waiting={
        kind === 'jql'
          ? 'Type a query, then click outside it to count its tickets.'
          : 'Pick a board or filter.'
      }
      labels={{ mine: 'Only my tickets', hideDone: 'Hide done tickets' }}
      mine={mine}
      hideDone={hideDone}
      onMine={setMine}
      onHideDone={setHideDone}
      disabled={acting || !view || taken !== undefined}
      onSubmit={() => follow()}
      onCancel={props.onCancel}
    >
      {others.length > 0 && (
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">Views you already have</span>
          <div className="flex flex-wrap gap-2">
            {others.map((v) => (
              <Button
                key={v.name}
                type="button"
                variant="outline"
                size="sm"
                title={v.describe}
                disabled={acting}
                onClick={() => follow(v.name)}
              >
                {v.name}
              </Button>
            ))}
          </div>
        </div>
      )}
      <fieldset className="grid grid-cols-2 gap-2">
        <legend className="sr-only">What to follow</legend>
        {KINDS.map(([value, label, hint]) => (
          <button
            key={value}
            type="button"
            aria-pressed={kind === value}
            onClick={() => {
              // Boards and saved filters are different lists: switching picks again.
              if ((value === 'filter') !== filter) setPicked(undefined);
              setKind(value);
            }}
            className={cn(
              'grid gap-0.5 rounded-xl border p-3 text-left hover:bg-accent/60',
              kind === value && 'border-primary bg-accent',
            )}
          >
            <span className="text-sm font-medium">{label}</span>
            <span className="text-xs text-muted-foreground">{hint}</span>
          </button>
        ))}
      </fieldset>
      {kind === 'jql' ? (
        <Textarea
          aria-label="JQL"
          placeholder="project = HB AND labels = backend"
          value={jql}
          onChange={(event) => setJql(event.currentTarget.value)}
          onBlur={() => setCheckedJql(jql)}
        />
      ) : (
        <ViewPicker kind={filter ? 'filter' : 'board'} picked={picked} onPick={setPicked} />
      )}
      <div className="grid gap-1.5">
        <Label htmlFor="view-name">
          Name <span className="font-normal text-muted-foreground">(optional)</span>
        </Label>
        <Input
          id="view-name"
          placeholder={suggested}
          value={typedName}
          aria-invalid={taken !== undefined || undefined}
          aria-describedby={taken === undefined ? undefined : 'view-name-taken'}
          onChange={(event) => setTypedName(event.currentTarget.value)}
        />
        {taken !== undefined && (
          <Muted id="view-name-taken" size="xs" className="text-destructive">
            You already have a view named {taken}. Follow it above, or pick another name.
          </Muted>
        )}
      </div>
    </FollowDialogFrame>
  );
}
