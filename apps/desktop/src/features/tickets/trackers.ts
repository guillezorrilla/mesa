import type { ProviderId, SourceId } from '@mesa/core';
import { type LucideIcon, SquareKanban } from 'lucide-react';
import type { ComponentType } from 'react';
import { FollowViewDialog } from './follow/FollowViewDialog';
import { JiraTicketFields, type TicketFieldsProps } from './JiraTicketFields';

/** What a tracker's Follow dialog gets from the tab. */
export type FollowDialogProps = {
  project: string;
  /** The views the project follows already. */
  following: string[];
  onFollowed: () => void;
  onCancel: () => void;
};

/**
 * Each tracker the Tickets tab shows (CONTEXT.md, Ticket view), keyed like core's ticket
 * providers: its name, the source it signs in with, its icon and tint, its Follow dialog, and the
 * fields its ticket panel adds after Status and Assignee. A new tracker is one row and its files.
 */
export const TRACKERS: Record<
  ProviderId,
  {
    name: string;
    source: SourceId;
    sourceLabel: string;
    icon: LucideIcon;
    tint: string;
    Follow: ComponentType<FollowDialogProps>;
    Fields: ComponentType<TicketFieldsProps>;
  }
> = {
  jira: {
    name: 'Jira',
    source: 'atlassian',
    sourceLabel: 'Atlassian',
    icon: SquareKanban,
    tint: 'text-state-working',
    Follow: FollowViewDialog,
    Fields: JiraTicketFields,
  },
};
