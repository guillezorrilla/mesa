import type { DoctorReport, ProjectRow } from '@mesa/core';
import { DollarSign, Search } from 'lucide-react';
import type { RefObject } from 'react';
import { Button } from '@/components/ui/button';
import { HelpMenu } from '@/features/help/HelpMenu';
import { NotificationsMenu } from '@/features/notifications/NotificationsMenu';
import { ProfileMenu } from '@/features/profile/ProfileMenu';
import { NewSessionMenu } from '@/features/sessions/start/NewSessionMenu';
import type { SessionPreset } from '@/features/sessions/start/useStartSession';
import type { SettingsCategory } from '@/features/settings/categories';
import { keyCaps } from '@/lib/shortcutKeys';
import type { WorkspaceView } from '@/lib/workspaceView';
import mesaLogo from '../../src-tauri/icons/128x128.png';
import type { Overlay } from './navigation';

/** The window's title bar, a drag region: the name, search, new session, the menus, and the profile. */
export function TitleBar(props: {
  view: WorkspaceView;
  navigate: (view: WorkspaceView) => void;
  overlay: Overlay | undefined;
  onOverlay: (overlay: Overlay | undefined) => void;
  onSettings: (category: SettingsCategory) => void;
  searchShortcut: string;
  onSearch: () => void;
  projects: readonly ProjectRow[] | undefined;
  /** The project in view, when it is listed. */
  currentProject?: string;
  canStart: boolean;
  onNewSession: (preset: SessionPreset) => void;
  doctor: DoctorReport | undefined;
  onRecheck: () => Promise<void>;
  profileMenu: RefObject<HTMLDetailsElement | null>;
}) {
  const { view, navigate } = props;
  return (
    <header
      data-tauri-drag-region="deep"
      className="relative z-40 flex h-12 shrink-0 select-none items-center gap-3 border-b bg-background pr-4 pl-20"
    >
      <h1
        data-testid="app-name"
        className="flex shrink-0 items-center gap-2 font-semibold tracking-tight"
      >
        <img src={mesaLogo} alt="" aria-hidden className="size-10 object-contain" />
        Mesa
      </h1>
      <div className="flex min-w-0 flex-1 items-center justify-center gap-3">
        <Button
          variant="outline"
          size="sm"
          data-testid="search-trigger"
          className="min-w-0 w-44 shrink justify-between rounded-full bg-card/80 text-muted-foreground sm:w-72"
          onClick={props.onSearch}
        >
          <span className="flex items-center gap-2">
            <Search aria-hidden className="size-4" /> Search Mesa
          </span>
          <kbd className="text-xs">{keyCaps(props.searchShortcut).join('')}</kbd>
        </Button>
        <NewSessionMenu
          projects={props.projects}
          current={props.currentProject}
          canStart={props.canStart}
          onStart={props.onNewSession}
        />
      </div>
      <nav aria-label="Workspace shortcuts" className="ml-auto flex shrink-0 items-center gap-2">
        {([['Cost', DollarSign, 'usage', 'cost']] as const).map(([label, Icon, kind, id]) => (
          <Button
            key={id}
            variant="ghost"
            size="icon-sm"
            data-testid={`nav-${id}`}
            aria-label={label}
            aria-current={view.kind === kind ? 'page' : undefined}
            title={label}
            className="text-muted-foreground hover:text-foreground"
            onClick={() => navigate({ kind })}
          >
            <Icon aria-hidden className="size-4" />
          </Button>
        ))}
        <HelpMenu
          onShortcuts={() => props.onOverlay('shortcuts')}
          onReference={() => navigate({ kind: 'help' })}
          onAbout={() => navigate({ kind: 'about' })}
        />
        <NotificationsMenu
          open={props.overlay === 'inbox'}
          onOpenChange={(open) => props.onOverlay(open ? 'inbox' : undefined)}
          onSession={(id) => navigate({ kind: 'session', id })}
          onDoctor={() => navigate({ kind: 'doctor' })}
          onAutomations={() => navigate({ kind: 'automations' })}
          onSettings={() => props.onSettings('notifications')}
          onRecheck={props.onRecheck}
          doctor={props.doctor}
        />
      </nav>
      <ProfileMenu
        ref={props.profileMenu}
        doctor={props.doctor}
        onSettings={() => navigate({ kind: 'preferences' })}
      />
    </header>
  );
}
