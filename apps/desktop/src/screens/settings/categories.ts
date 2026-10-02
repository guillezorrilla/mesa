import {
  Bell,
  Bot,
  GitBranch,
  Keyboard,
  type LucideIcon,
  Settings,
  SlidersHorizontal,
  SquareTerminal,
} from 'lucide-react';

export type SettingsCategory =
  | 'general'
  | 'sessions'
  | 'terminal'
  | 'git'
  | 'notifications'
  | 'agents'
  | 'advanced';

/** the reference app's categories, in its order, each with the sections Mesa has settings for. */
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
      ['claude', 'Claude Code'],
      ['codex', 'Codex'],
      ['antigravity', 'Antigravity CLI'],
      ['headless', 'Headless runs'],
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
