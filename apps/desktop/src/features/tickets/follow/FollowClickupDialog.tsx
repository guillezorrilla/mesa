import type { ClickupSavedView, ViewQuery } from '@mesa/core';
import { useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useCommand } from '@/lib/useCommand';
import type { FollowDialogProps } from '../trackers';
import { type ClickupLocation, ClickupLocationTree } from './ClickupLocationTree';
import { ClickupSavedViews } from './ClickupSavedViews';
import { FollowDialogFrame } from './FollowDialogFrame';
import { useFollowView } from './useFollowView';

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
  const locations = useCommand('tickets.locations');
  const [mode, setMode] = useState<'location' | 'saved'>('location');
  const [location, setLocation] = useState<ClickupLocation>();
  const [savedView, setSavedView] = useState<ClickupSavedView>();
  const picked =
    mode === 'location'
      ? location && { at: { [location.kind]: location.id }, ...location }
      : savedView && { at: { view: savedView.id }, ...savedView };
  const query: ViewQuery | undefined = picked && {
    provider: 'clickup',
    workspace: picked.workspace,
    ...picked.at,
  };
  const { view, name, acting, follow, toggles } = useFollowView(
    props.project,
    props.onFollowed,
    query,
    picked?.name ?? 'ClickUp',
  );
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
      {...toggles}
      disabled={acting || !view}
      onSubmit={() => follow()}
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
