import type { Board, Filter, ViewInput } from '@mesa/core';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

type Kind = 'current' | 'next' | 'filter' | 'jql';
const KINDS = [
  ['current', 'Current sprint'],
  ['next', 'Next sprint'],
  ['filter', 'Saved filter'],
  ['jql', 'JQL'],
] as const;

/**
 * Follow a ticket view (CONTEXT.md, Ticket view): one the profile defines already, or a new one,
 * a board's current or next sprint (found by searching boards), a saved filter, or JQL, with
 * Only mine and Hide done on by default.
 */
export function FollowViewDialog(props: {
  project: string;
  /** The views the project follows already, left out of the choice. */
  following: string[];
  onFollowed: () => void;
  onCancel: () => void;
}) {
  const views = useCommand('tickets.views');
  const run = useRun();
  const { acting, act } = useAct();
  const choices = (views.data ?? []).filter((view) => !props.following.includes(view.name));
  const [existing, setExisting] = useState('');
  const [kind, setKind] = useState<Kind>('current');
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<(Board | Filter)[]>();
  const [picked, setPicked] = useState('');
  const [jql, setJql] = useState('');
  const [name, setName] = useState('');
  const [mine, setMine] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const board = kind === 'current' || kind === 'next';
  const find = () =>
    void act(async () => {
      const result = board
        ? (await run('tickets.boards', { search }))?.boards
        : (await run('tickets.filters', { search }))?.filters;
      setFound(result);
      setPicked(result?.[0] ? String(result[0].id) : '');
      return undefined;
    });
  const pickedName = found?.find((item) => String(item.id) === picked)?.name;
  const query =
    kind === 'jql'
      ? { jql: jql.trim() }
      : board
        ? { board: Number(picked), sprint: kind }
        : { filter: picked };
  const ready = existing
    ? true
    : Boolean(name.trim()) && (kind === 'jql' ? Boolean(jql.trim()) : Boolean(picked));
  const submit = () =>
    void act(async () => {
      let view = existing;
      if (!view) {
        const input: ViewInput = {
          name: name.trim(),
          ...query,
          ...(mine ? {} : { everyone: true }),
          ...(hideDone ? {} : { showDone: true }),
        };
        const added = await run('tickets.viewsAdd', { view: input });
        if (!added) return undefined;
        view = added.name;
      }
      if (await run('tickets.follow', { project: props.project, view })) props.onFollowed();
      return undefined;
    });
  return (
    <ActionDialog
      testId="follow-view-dialog"
      wide
      title="Follow a ticket view"
      description="Its tickets are read from Jira each time the Tickets tab opens or refreshes."
      submit={{ label: 'Follow', testId: 'confirm-follow-view', disabled: acting || !ready }}
      onSubmit={submit}
      onCancel={props.onCancel}
    >
      {choices.length > 0 && (
        <Label className="grid gap-1.5">
          A view you defined
          <NativeSelect
            aria-label="A view you defined"
            value={existing}
            onChange={(event) => setExisting(event.currentTarget.value)}
          >
            <NativeSelectOption value="">A new view</NativeSelectOption>
            {choices.map((view) => (
              <NativeSelectOption key={view.name} value={view.name}>
                {view.name}: {view.describe}
              </NativeSelectOption>
            ))}
          </NativeSelect>
        </Label>
      )}
      {!existing && (
        <>
          <SegmentedControl
            label="What the view reads"
            value={kind}
            options={KINDS}
            onChange={(next) => {
              // Boards and saved filters are different lists: a switch between them searches again.
              if ((next === 'filter') !== (kind === 'filter')) {
                setFound(undefined);
                setPicked('');
              }
              setKind(next);
            }}
          />
          {kind === 'jql' ? (
            <Textarea
              aria-label="JQL"
              placeholder="project = LC AND labels = backend"
              value={jql}
              onChange={(event) => setJql(event.currentTarget.value)}
            />
          ) : (
            <div className="grid gap-2">
              <div className="flex gap-2">
                <Input
                  id="ticket-view-search"
                  aria-label={board ? 'Search boards' : 'Search saved filters'}
                  placeholder={board ? 'Board name' : 'Filter name'}
                  value={search}
                  onChange={(event) => setSearch(event.currentTarget.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      find();
                    }
                  }}
                />
                <Button type="button" variant="outline" disabled={acting} onClick={find}>
                  Search
                </Button>
              </div>
              {found &&
                (found.length ? (
                  <NativeSelect
                    aria-label={board ? 'Board' : 'Saved filter'}
                    value={picked}
                    onChange={(event) => setPicked(event.currentTarget.value)}
                  >
                    {found.map((item) => (
                      <NativeSelectOption key={item.id} value={String(item.id)}>
                        {item.name}
                        {'project' in item && item.project ? ` (${item.project})` : ''}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                ) : (
                  <Muted>None found.</Muted>
                ))}
            </div>
          )}
          <Label className="grid gap-1.5">
            Name
            <Input
              id="ticket-view-name"
              aria-label="View name"
              placeholder={pickedName ?? 'sprint'}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          </Label>
          <div className="flex gap-6">
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={mine} onCheckedChange={setMine} aria-label="Only mine" />
              Only mine
            </Label>
            <Label className="flex items-center gap-2 font-normal">
              <Switch checked={hideDone} onCheckedChange={setHideDone} aria-label="Hide done" />
              Hide done
            </Label>
          </div>
        </>
      )}
    </ActionDialog>
  );
}
