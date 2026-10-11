import type { ProviderId, SourceId, Ticket } from '@mesa/core';
import { CircleDot, type LucideIcon, SquareKanban } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { FollowRepoDialog } from './follow/FollowRepoDialog';
import { FollowViewDialog } from './follow/FollowViewDialog';
import { GithubRepoGate } from './github/GithubRepoGate';
import { GithubSettingsRow } from './github/GithubSettingsRow';
import { GithubSetupPanel } from './github/GithubSetupPanel';
import { GithubState } from './github/GithubState';
import { GithubTicketFields } from './github/GithubTicketFields';
import { JiraSetupPanel } from './JiraSetupPanel';
import { JiraStatus } from './JiraStatus';
import { JiraTicketFields } from './JiraTicketFields';
import type { TicketFieldsProps } from './ticketFields';

/** What a tracker's Follow dialog gets from the tab. */
export type FollowDialogProps = {
  project: string;
  /** The views the project follows already. */
  following: string[];
  onFollowed: () => void;
  onCancel: () => void;
};

/** One tracker as the Tickets tab shows it, its panel fields over its own provider's panel read. */
type Tracker<K extends ProviderId> = {
  name: string;
  /** Its name in a sentence or a button, such as Switch to GitHub. */
  short: string;
  source: SourceId;
  sourceLabel: string;
  /** The first-run choice's line before its source is connected. */
  signIn: string;
  icon: LucideIcon;
  tint: string;
  /** What a project follows, in the tool's words: a view (Jira) or a repo (GitHub). */
  unit: 'view' | 'repo';
  /** What it calls its items. */
  nouns: string;
  /** Its own names for the list's status groups, where it has them. */
  groups?: Partial<Record<Ticket['category'], string>>;
  /** A ticket's key as the list and the panel show it. */
  shortKey: (key: string) => string;
  /** The tracker icon beside a ticket's id in the panel: not on Jira, which looks as before. */
  mark: boolean;
  /** A ticket takes several assignees, so Assign to me adds the person beside them. */
  several: boolean;
  /** The panel's name for the status row, and how it shows a ticket's status. */
  statusName: string;
  Status: ComponentType<{ ticket: Ticket }>;
  /** The tab before the project follows anything in it. */
  Setup: ComponentType<{ onFollow: () => void }>;
  /** Not connected shows a page with Connect, instead of Jira's banner over the views. */
  connectPage: boolean;
  /** Wraps the first-run choice's Use button once signed in: what it still needs first. */
  Gate?: ComponentType<{ project: string; children: ReactNode }>;
  /** More under the gear's tracker row. */
  Settings?: ComponentType<{ project: string }>;
  Follow: ComponentType<FollowDialogProps>;
  Fields: ComponentType<TicketFieldsProps<K>>;
};

/**
 * Each tracker the Tickets tab shows (CONTEXT.md, Ticket view, Tracker), keyed like core's ticket
 * providers: its name and words, the source it signs in with, its icon and tint, its setup and
 * Follow dialog, and how its panel shows a ticket. A new tracker is one row and its files.
 */
export const TRACKERS: { [K in ProviderId]: Tracker<K> } = {
  jira: {
    name: 'Jira',
    short: 'Jira',
    source: 'atlassian',
    sourceLabel: 'Atlassian',
    signIn: 'Sign in with your Atlassian account',
    icon: SquareKanban,
    tint: 'text-state-working',
    unit: 'view',
    nouns: 'tickets',
    shortKey: (key) => key,
    mark: false,
    several: false,
    statusName: 'Status',
    Status: JiraStatus,
    Setup: JiraSetupPanel,
    connectPage: false,
    Follow: FollowViewDialog,
    Fields: JiraTicketFields,
  },
  github: {
    name: 'GitHub Issues',
    short: 'GitHub',
    source: 'github',
    sourceLabel: 'GitHub',
    signIn: 'Sign in, then pick the repos Mesa may read',
    icon: CircleDot,
    tint: 'text-tracker-github',
    unit: 'repo',
    nouns: 'issues',
    groups: { new: 'Open', done: 'Closed' },
    shortKey: (key) => key.slice(key.lastIndexOf('#')),
    mark: true,
    several: true,
    statusName: 'State',
    Status: GithubState,
    Setup: GithubSetupPanel,
    connectPage: true,
    Gate: GithubRepoGate,
    Settings: GithubSettingsRow,
    Follow: FollowRepoDialog,
    Fields: GithubTicketFields,
  },
};

/** Every tracker, in the order the first-run choice and the switch list them. */
export const TRACKER_IDS = Object.keys(TRACKERS) as ProviderId[];

/** The fields component of `provider`, over the panel read of any provider (it is that one's). */
export const fieldsOf = (provider: ProviderId) =>
  TRACKERS[provider].Fields as ComponentType<TicketFieldsProps<ProviderId>>;
