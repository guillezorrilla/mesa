import { AGENT_LABELS, AGENT_NAMES } from '@mesa/core/browser';
import {
  Bell,
  Bot,
  Cable,
  FolderGit2,
  GitBranch,
  Keyboard,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  Sparkles,
  SquareTerminal,
} from 'lucide-react';

export type SettingsCategory =
  | 'general'
  | 'sessions'
  | 'terminal'
  | 'git'
  | 'projects'
  | 'notifications'
  | 'agents'
  | 'connections'
  | 'decisions'
  | 'advanced';

/** The setting categories in order, with Connections and Smarter decisions; each lists the sections Mesa has settings for. */
export const CATEGORIES: {
  id: SettingsCategory;
  label: string;
  icon: LucideIcon;
  sections: readonly (readonly [string, string])[];
}[] = [
  {
    id: 'general',
    label: 'General',
    icon: Settings,
    sections: [
      ['application', 'Application'],
      ['vault', 'Vault'],
      ['appearance', 'Appearance'],
      ['accessibility', 'Accessibility'],
      ['doctor', 'Doctor'],
    ],
  },
  {
    id: 'sessions',
    label: 'Sessions',
    icon: SquareTerminal,
    sections: [
      ['defaults', 'Defaults'],
      ['logs', 'Session logs'],
      ['status-line', 'Status line'],
      ['saved-prompts', 'Saved Prompts'],
    ],
  },
  {
    id: 'terminal',
    label: 'Terminal & Editor',
    icon: Keyboard,
    sections: [
      ['terminal', 'Terminal'],
      ['input', 'Input & Shortcuts'],
      ['editor', 'Editor'],
    ],
  },
  {
    id: 'git',
    label: 'Git & Worktrees',
    icon: GitBranch,
    sections: [
      ['worktrees', 'Worktrees'],
      ['scripts', 'Scripts'],
      ['cleanup', 'Cleanup'],
    ],
  },
  {
    id: 'projects',
    label: 'Projects',
    icon: FolderGit2,
    sections: [
      ['project', 'Project'],
      ['project-terminal', 'Terminal'],
      ['project-worktrees', 'Worktrees'],
      ['project-scripts', 'Scripts'],
    ],
  },
  {
    id: 'notifications',
    label: 'Notifications',
    icon: Bell,
    sections: [
      ['notification-center', 'Notification Center'],
      ['session-events', 'Session Events'],
    ],
  },
  {
    id: 'agents',
    label: 'Coding Agents',
    icon: Bot,
    sections: [
      ['overview', 'Overview'],
      ...AGENT_NAMES.map((agent) => [agent, AGENT_LABELS[agent]] as const),
      ['headless', 'Headless runs'],
    ],
  },
  {
    id: 'connections',
    label: 'Connections',
    icon: Cable,
    sections: [['sources', 'Sources']],
  },
  {
    id: 'decisions',
    label: 'Smarter decisions',
    icon: Sparkles,
    sections: [
      ['jev', 'Jev'],
      ['clef', 'CLEF'],
      ['none', 'None'],
    ],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: SlidersHorizontal,
    sections: [
      ['decisions', 'Decisions'],
      ['data', 'Data'],
    ],
  },
];
