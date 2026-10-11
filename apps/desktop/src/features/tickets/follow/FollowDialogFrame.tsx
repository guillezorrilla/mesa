import type { ProviderId, ViewInput } from '@mesa/core';
import type { ComponentProps, ReactNode } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { TrackerIcon } from '../TrackerIcon';
import { FollowToggles } from './FollowToggles';
import { ViewCount } from './ViewCount';

/**
 * The frame every tracker's Follow dialog shares: its icon and title, the tracker's own picker
 * (children), Only mine and Hide done, and the live count of what the view would list, or
 * `waiting` until there is a view to count.
 */
export function FollowDialogFrame(
  props: {
    tracker: ProviderId;
    title: string;
    description: string;
    /** The view picked so far, with its name, when it is complete. */
    view: Omit<ViewInput, 'name'> | undefined;
    name: string;
    waiting: string;
    disabled: boolean;
    onSubmit: () => void;
    onCancel: () => void;
    children: ReactNode;
  } & ComponentProps<typeof FollowToggles>,
) {
  return (
    <ActionDialog
      testId="follow-view-dialog"
      wide
      title={
        <span className="flex items-center gap-2">
          <TrackerIcon tracker={props.tracker} />
          {props.title}
        </span>
      }
      description={props.description}
      submit={{ label: 'Follow', testId: 'confirm-follow-view', disabled: props.disabled }}
      onSubmit={props.onSubmit}
      onCancel={props.onCancel}
    >
      {props.children}
      <FollowToggles
        labels={props.labels}
        mine={props.mine}
        hideDone={props.hideDone}
        onMine={props.onMine}
        onHideDone={props.onHideDone}
      />
      {props.view ? (
        <ViewCount view={props.view} name={props.name} />
      ) : (
        <Muted role="status">{props.waiting}</Muted>
      )}
    </ActionDialog>
  );
}
