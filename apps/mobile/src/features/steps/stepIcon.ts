import type { PhoneStep } from '@mesa/core/phone';
import type { LucideIcon } from 'lucide-react-native';
import Bot from 'lucide-react-native/icons/bot';
import Brain from 'lucide-react-native/icons/brain';
import Eye from 'lucide-react-native/icons/eye';
import FilePen from 'lucide-react-native/icons/file-pen';
import Folder from 'lucide-react-native/icons/folder';
import Globe from 'lucide-react-native/icons/globe';
import ListChecks from 'lucide-react-native/icons/list-checks';
import Search from 'lucide-react-native/icons/search';
import SquareTerminal from 'lucide-react-native/icons/square-terminal';
import Wrench from 'lucide-react-native/icons/wrench';

/** A tool kind's mark, as orca's chat draws it (MobileNativeChatToolIcon). */
const TOOL_ICONS: Record<string, LucideIcon> = {
  read: Eye,
  search: Search,
  list: Folder,
  command: SquareTerminal,
  web: Globe,
  agent: Bot,
  plan: ListChecks,
};

/** A step's mark: its tool kind's, an edit's pen, a thought's brain; any other tool a wrench. */
export const stepIcon = (step: PhoneStep): LucideIcon =>
  step.type === 'edit'
    ? FilePen
    : step.type === 'thought'
      ? Brain
      : (TOOL_ICONS[step.kind] ?? Wrench);
