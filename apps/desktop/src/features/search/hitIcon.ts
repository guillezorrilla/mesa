import type { CommandId, SearchHit } from '@mesa/core/browser';
import {
  Archive,
  ArrowLeftRight,
  BookOpen,
  Bot,
  CalendarClock,
  CircleHelp,
  Folder,
  Grid2X2,
  Keyboard,
  type LucideIcon,
  MessageSquareText,
  Plus,
  Search,
  SlidersHorizontal,
  Sparkles,
  Stethoscope,
  TerminalSquare,
  UserRound,
  Zap,
} from 'lucide-react';

/**
 * Each fixed command's icon, also the sidebar's for the same destination: one owner. Core stays
 * free of UI.
 */
export const COMMAND_ICONS: Record<CommandId, LucideIcon> = {
  sessions: TerminalSquare,
  grid: Grid2X2,
  automations: CalendarClock,
  doctor: Stethoscope,
  help: CircleHelp,
  'new-session': Plus,
  'switch-session': ArrowLeftRight,
  shortcuts: Keyboard,
  'open-vault': BookOpen,
  profile: UserRound,
  preferences: SlidersHorizontal,
  prompts: MessageSquareText,
  backup: Archive,
  'smarter-decisions': Sparkles,
};

const BY_KIND: Record<SearchHit['kind'], LucideIcon> = {
  navigation: TerminalSquare,
  action: Zap,
  setting: SlidersHorizontal,
  project: Folder,
  session: Bot,
  prompt: MessageSquareText,
  vault: Search,
};

/** The palette row's icon: a fixed hit's own, else its kind's. */
export const hitIcon = (hit: SearchHit): LucideIcon =>
  (hit.kind === 'navigation' || hit.kind === 'action' || hit.kind === 'setting'
    ? COMMAND_ICONS[hit.id]
    : undefined) ?? BY_KIND[hit.kind];
