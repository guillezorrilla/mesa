import type { SidebarTabId } from '@mesa/core/browser';
import { FolderGit2, type LucideIcon } from 'lucide-react';
import { COMMAND_ICONS } from '@/features/search/hitIcon';

/** Each sidebar tab's icon: the tab bar's, its controls' and the Inbox's. */
export const SIDEBAR_TAB_ICONS: Record<SidebarTabId, LucideIcon> = {
  sessions: COMMAND_ICONS.sessions,
  projects: FolderGit2,
  reviews: COMMAND_ICONS.reviews,
  logs: COMMAND_ICONS.logs,
};
