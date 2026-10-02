import type { DoctorReport } from '@mesa/core';
import { ChevronDown, ChevronRight, CircleCheck, Search, Settings, X } from 'lucide-react';
import { useState } from 'react';
import { IconButton } from '@/components/IconButton';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { AdvancedSettings } from './AdvancedSettings';
import { AgentSettings } from './AgentSettings';
import { CATEGORIES, type SettingsCategory } from './categories';
import { GeneralSettings } from './GeneralSettings';
import { NotificationSettings } from './NotificationSettings';
import { ProjectSettings } from './ProjectSettings';
import { SessionSettings } from './SessionSettings';
import { TerminalEditorSettings } from './TerminalEditorSettings';
import { SettingsQuery } from './useMatches';
import { SettingsContext } from './useSettings';
import { WorktreeSettings } from './WorktreeSettings';

/** Screens the settings window hands off to; it closes first. */
export type SettingsDestination = 'doctor' | 'prompts' | 'shortcuts' | 'backup' | 'usage';

/** Xirp's Settings window: the profile, a searchable category tree, and each category's rows. */
export function SettingsDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  category?: SettingsCategory;
  doctor?: DoctorReport;
  doctorBusy: boolean;
  onRecheck: () => void;
  onNavigate: (to: SettingsDestination) => void;
  onReplayTour: () => void;
  /** After a field is saved, so the app re-reads what it applies (theme, fonts). */
  onChanged: () => void;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent
        data-testid="settings"
        showCloseButton={false}
        className="grid h-[85vh] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden bg-card p-0 sm:max-w-5xl"
      >
        <SettingsBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

function SettingsBody(props: Parameters<typeof SettingsDialog>[0]) {
  const [category, setCategory] = useState<SettingsCategory>(props.category ?? 'general');
  const [query, setQuery] = useState('');
  const config = useCommand('config.get');
  const profile = useCommand('profile.get');
  const run = useRun();
  const { acting, act } = useAct();
  const save = (path: string, value: unknown) =>
    void act(async () => {
      if (!(await run('config.set', { path, value }))) return undefined;
      await config.refresh();
      props.onChanged();
      return undefined;
    });
  const go = (to: SettingsDestination) => {
    props.onOpenChange(false);
    props.onNavigate(to);
  };
  const show = (next: SettingsCategory, section?: string) => {
    setQuery('');
    setCategory(next);
    requestAnimationFrame(() =>
      document
        .getElementById(section ? `settings-${section}` : 'settings-content')
        ?.scrollIntoView({ block: 'start' }),
    );
  };
  const page = (id: SettingsCategory) =>
    ({
      general: (
        <GeneralSettings
          doctor={props.doctor}
          doctorBusy={props.doctorBusy}
          onRecheck={props.onRecheck}
          onDoctor={() => go('doctor')}
          onReplayTour={() => {
            props.onOpenChange(false);
            props.onReplayTour();
          }}
        />
      ),
      sessions: <SessionSettings onSavedPrompts={() => go('prompts')} />,
      terminal: <TerminalEditorSettings onShortcuts={() => go('shortcuts')} />,
      git: <WorktreeSettings />,
      projects: <ProjectSettings onChanged={props.onChanged} />,
      notifications: <NotificationSettings />,
      agents: <AgentSettings doctor={props.doctor} />,
      advanced: <AdvancedSettings onBackup={() => go('backup')} onUsage={() => go('usage')} />,
    })[id];
  const current = CATEGORIES.find((entry) => entry.id === category) ?? CATEGORIES[0];
  return (
    <>
      <div className="flex items-center justify-between border-b px-5 py-3">
        <DialogTitle className="flex items-center gap-3 text-lg font-medium">
          <Settings aria-hidden className="size-5 text-state-waiting" /> Settings
        </DialogTitle>
        <DialogDescription className="sr-only">
          Profile settings, saved through mesa config set.
        </DialogDescription>
        <IconButton label="Close settings" icon={X} onClick={() => props.onOpenChange(false)} />
      </div>
      <div className="grid min-h-0 grid-cols-[18rem_minmax(0,1fr)]">
        <aside className="flex min-h-0 flex-col border-r">
          <div className="border-b px-5 py-4">
            <p className="truncate text-sm font-semibold">
              Profile: {profile.data?.profile ?? '...'}
            </p>
            <p className="truncate text-xs text-muted-foreground" title={profile.data?.dir}>
              {profile.data?.dir}
            </p>
          </div>
          <div className="p-3">
            <label className="flex items-center gap-2 rounded-lg border bg-background px-3 py-2">
              <Search aria-hidden className="size-4 text-muted-foreground" />
              <input
                aria-label="Search settings"
                className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                placeholder="Search settings"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
          </div>
          <nav aria-label="Settings categories" className="min-h-0 flex-1 overflow-y-auto px-3">
            {CATEGORIES.map((entry) => {
              const open = entry.id === category && !query;
              const Chevron = open ? ChevronDown : ChevronRight;
              return (
                <div key={entry.id}>
                  <button
                    type="button"
                    aria-current={open ? 'page' : undefined}
                    className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-accent/60 hover:text-foreground aria-[current=page]:bg-accent aria-[current=page]:text-foreground"
                    onClick={() => show(entry.id)}
                  >
                    <entry.icon aria-hidden className="size-4" />
                    <span className="flex-1 text-left">{entry.label}</span>
                    <Chevron aria-hidden className="size-4" />
                  </button>
                  {open && (
                    <div className="my-1 ml-5 border-l pl-3">
                      {entry.sections.map(([id, label]) => (
                        <button
                          key={id}
                          type="button"
                          className="block w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent/60 hover:text-foreground"
                          onClick={() => show(entry.id, id)}
                        >
                          {label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </nav>
          <p className="flex items-center gap-2 border-t px-5 py-3 text-xs text-muted-foreground">
            <CircleCheck
              aria-hidden
              className={cn('size-4', props.doctor?.healthy && 'text-state-idle')}
            />
            Doctor: {props.doctor ? props.doctor.summary : 'checking...'}
          </p>
        </aside>
        <div id="settings-content" className="min-h-0 overflow-y-auto">
          {config.data ? (
            <SettingsContext.Provider value={{ config: config.data, acting, save }}>
              <SettingsQuery.Provider value={query}>
                <div className="space-y-8 px-6 py-5 [&:not(:has([data-setting-row]:not([hidden])))_[data-empty]]:block">
                  {query ? (
                    <>
                      <h2 className="text-lg font-medium">Results for "{query}"</h2>
                      <p data-empty className="hidden text-sm text-muted-foreground">
                        No settings match.
                      </p>
                      {CATEGORIES.map((entry) => (
                        <div key={entry.id} className="space-y-8">
                          {page(entry.id)}
                        </div>
                      ))}
                    </>
                  ) : (
                    <>
                      <h2 className="text-lg font-medium">{current?.label}</h2>
                      {page(category)}
                    </>
                  )}
                </div>
              </SettingsQuery.Provider>
            </SettingsContext.Provider>
          ) : (
            <p className="p-6 text-sm text-muted-foreground">Loading settings...</p>
          )}
        </div>
      </div>
    </>
  );
}
