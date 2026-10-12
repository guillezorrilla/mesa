import type { ClickupSavedView, ViewQuery } from '@mesa/core';
import { useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import type { FollowDialogProps } from '../trackers';
import { type ClickupLocation, ClickupLocationTree } from './ClickupLocationTree';
import { ClickupSavedViews } from './ClickupSavedViews';
import { FollowDialogFrame } from './FollowDialogFrame';
import { freeName } from './freeName';

const MODES = [
  ['location', 'Location'],
  ['saved', 'Saved view'],
] as const;

/**
 * ClickUp's Follow dialog, "Follow ClickUp tasks": a Location (a List, or every List in a Folder
 * or Space, from the Space > Folder > List tree) or a saved view, with Only tasks assigned to me,
 * Hide closed tasks, and the live count, subtasks included. The view is named after what it follows.
 */
export function FollowClickupDialog(props: FollowDialogProps) {
  const run = useRun();
  const { acting, act } = useAct();
  const views = useCommand('tickets.views');
  const locations = useCommand('tickets.locations');
  const [mode, setMode] = useState<'location' | 'saved'>('location');
  const [location, setLocation] = useState<ClickupLocation>();
  const [savedView, setSavedView] = useState<ClickupSavedView>();
  const [mine, setMine] = useState(true);
  const [hideDone, setHideDone] = useState(true);
  const picked =
    mode === 'location'
      ? location && { at: { [location.kind]: location.id }, ...location }
      : savedView && { at: { view: savedView.id }, ...savedView };
  const view: ViewQuery | undefined = picked && {
    provider: 'clickup',
    workspace: picked.workspace,
    ...picked.at,
    ...(mine ? {} : { everyone: true }),
    ...(hideDone ? {} : { showDone: true }),
  };
  const name = freeName(
    picked?.name ?? 'ClickUp',
    (views.data ?? []).map((v) => v.name),
  );
  const follow = () =>
    void act(async () => {
      const followed = view && (await run('tickets.viewsAdd', { view: { ...view, name } }));
      if (
        followed &&
        (await run('tickets.follow', { project: props.project, view: followed.name }))
      )
        props.onFollowed();
      return undefined;
    });
  return (
    <FollowDialogFrame
      tracker="clickup"
      title="Follow ClickUp tasks"
      description="They show up in this tab, subtasks included."
      view={view}
      name={name}
      words={{ nouns: 'tasks', query: 'the request Mesa sends', extra: ', subtasks included' }}
      waiting={locations.data ? 'Pick what to follow.' : 'Reading ClickUp...'}
      labels={{ mine: 'Only tasks assigned to me', hideDone: 'Hide closed tasks' }}
      mine={mine}
      hideDone={hideDone}
      onMine={setMine}
      onHideDone={setHideDone}
      disabled={acting || !view}
      onSubmit={follow}
      onCancel={props.onCancel}
    >
      <SegmentedControl
        label="What to follow"
        options={MODES}
        value={mode}
        onChange={setMode}
        className="w-fit"
      />
      {mode === 'location' ? (
        locations.data && (
          <ClickupLocationTree
            workspaces={locations.data.workspaces}
            picked={location}
            onPick={setLocation}
          />
        )
      ) : (
        <ClickupSavedViews picked={savedView} onPick={setSavedView} />
      )}
    </FollowDialogFrame>
  );
}
