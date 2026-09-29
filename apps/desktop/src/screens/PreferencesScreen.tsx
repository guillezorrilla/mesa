import type { Config } from '@mesa/core';
import { TERMINAL_APPS } from '@mesa/core/browser';
import { useEffect, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

const appearanceChoices = [
  {
    key: 'theme',
    label: 'Interface theme',
    options: [
      ['system', 'System'],
      ['dark', 'Dark'],
      ['light', 'Light'],
    ],
  },
  {
    key: 'font',
    label: 'Interface font',
    options: [
      ['plex', 'IBM Plex Sans'],
      ['system', 'System'],
    ],
  },
  {
    key: 'density',
    label: 'Layout density',
    options: [
      ['comfortable', 'Comfortable'],
      ['compact', 'Compact'],
    ],
  },
  {
    key: 'colorVision',
    label: 'Color vision',
    options: [
      ['normal', 'Normal'],
      ['red-green', 'Red-green'],
      ['blue-yellow', 'Blue-yellow'],
    ],
  },
] as const;

/** Profile display and terminal settings, saved through the same validated config path as CLI. */
export function PreferencesScreen(props: {
  config?: Config;
  onChanged: () => void;
  onNavigate: (
    view: 'shortcuts' | 'doctor' | 'inbox' | 'usage' | 'projects' | 'prompts' | 'backup',
  ) => void;
  onReplayTour: () => void;
}) {
  const run = useRun();
  const { acting, act } = useAct();
  const [fontDraft, setFontDraft] = useState('');
  useEffect(
    () => setFontDraft(props.config?.terminal.fontFamily ?? ''),
    [props.config?.terminal.fontFamily],
  );
  const save = (path: string, value: unknown) =>
    void act(async () => {
      if (await run('config.set', { path, value })) props.onChanged();
      return undefined;
    });
  if (!props.config) return <p className="text-sm text-muted-foreground">Loading preferences...</p>;
  const { appearance, terminal } = props.config;
  return (
    <section data-testid="preferences" className="max-w-3xl space-y-4">
      <PageHeader title="Preferences" description="Profile-wide display and terminal settings" />
      <Card>
        <CardHeader>
          <CardTitle>Application</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-2">
            <Checkbox
              id="warn-before-quit"
              checked={props.config.application.warnBeforeQuit}
              disabled={acting}
              onCheckedChange={(value) => save('application.warnBeforeQuit', value === true)}
            />
            <Label htmlFor="warn-before-quit">Warn before quitting</Label>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="backup-on-close"
              checked={props.config.application.backupOnClose}
              disabled={acting}
              onCheckedChange={(value) => save('application.backupOnClose', value === true)}
            />
            <Label htmlFor="backup-on-close">Create a local backup on close</Label>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Appearance</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {appearanceChoices.map(({ key, label, options }) => (
            <div key={key} className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
              <Label htmlFor={`appearance-${key}`}>{label}</Label>
              <NativeSelect
                id={`appearance-${key}`}
                value={appearance[key]}
                disabled={acting}
                onChange={(event) => save(`appearance.${key}`, event.currentTarget.value)}
              >
                {options.map(([value, text]) => (
                  <NativeSelectOption key={value} value={value}>
                    {text}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
            </div>
          ))}
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="appearance-size">Interface text size: {appearance.fontSize}px</Label>
            <Input
              id="appearance-size"
              type="range"
              min={12}
              max={20}
              value={appearance.fontSize}
              disabled={acting}
              onChange={(event) => save('appearance.fontSize', Number(event.currentTarget.value))}
            />
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Terminal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="terminal-theme">Terminal theme</Label>
            <NativeSelect
              id="terminal-theme"
              value={terminal.theme}
              disabled={acting}
              onChange={(event) => save('terminal.theme', event.currentTarget.value)}
            >
              <NativeSelectOption value="follow">Follow interface</NativeSelectOption>
              <NativeSelectOption value="dark">Dark</NativeSelectOption>
              <NativeSelectOption value="light">Light</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="terminal-size">Terminal text size: {terminal.fontSize}px</Label>
            <Input
              id="terminal-size"
              type="range"
              min={10}
              max={24}
              value={terminal.fontSize}
              disabled={acting}
              onChange={(event) => save('terminal.fontSize', Number(event.currentTarget.value))}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="terminal-font">Terminal font family</Label>
            <div className="flex gap-2">
              <Input
                id="terminal-font"
                value={fontDraft}
                onChange={(event) => setFontDraft(event.currentTarget.value)}
              />
              <Button
                variant="outline"
                disabled={acting || !fontDraft.trim() || fontDraft === terminal.fontFamily}
                onClick={() => save('terminal.fontFamily', fontDraft)}
              >
                Save
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Checkbox
              id="option-as-meta"
              checked={terminal.optionAsMeta}
              disabled={acting}
              onCheckedChange={(value) => save('terminal.optionAsMeta', value === true)}
            />
            <Label htmlFor="option-as-meta">Use Option as Meta</Label>
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Checkbox
                id="natural-selection"
                checked={terminal.naturalSelection}
                disabled={acting}
                onCheckedChange={(value) => save('terminal.naturalSelection', value === true)}
              />
              <Label htmlFor="natural-selection">Select text with a plain drag</Label>
            </div>
            <p className="pl-6 text-xs text-muted-foreground">
              Reopen a terminal panel to apply. This disables tmux mouse reporting in that view.
            </p>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="scroll-speed">Scroll speed: {terminal.scrollSpeed}x</Label>
            <Input
              id="scroll-speed"
              type="range"
              min={1}
              max={20}
              value={terminal.scrollSpeed}
              disabled={acting}
              onChange={(event) => save('terminal.scrollSpeed', Number(event.currentTarget.value))}
            />
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="submit-shortcut">Additional submit shortcut</Label>
            <NativeSelect
              id="submit-shortcut"
              value={terminal.extraSubmitKey}
              disabled={acting}
              onChange={(event) => save('terminal.extraSubmitKey', event.currentTarget.value)}
            >
              <NativeSelectOption value="none">Native Enter only</NativeSelectOption>
              <NativeSelectOption value="cmd-enter">Cmd+Enter also submits</NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="newline-shortcut">Additional newline shortcut</Label>
            <NativeSelect
              id="newline-shortcut"
              value={terminal.newlineKey}
              disabled={acting}
              onChange={(event) => save('terminal.newlineKey', event.currentTarget.value)}
            >
              <NativeSelectOption value="native">Native agent keys</NativeSelectOption>
              <NativeSelectOption value="shift-enter">
                Shift+Enter sends a newline
              </NativeSelectOption>
            </NativeSelect>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_14rem] sm:items-center">
            <Label htmlFor="terminal-app">External terminal</Label>
            <NativeSelect
              id="terminal-app"
              value={terminal.app}
              disabled={acting}
              onChange={(event) => save('terminal.app', event.currentTarget.value)}
            >
              {TERMINAL_APPS.map((app) => (
                <NativeSelectOption key={app} value={app}>
                  {app}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Related settings</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={props.onReplayTour}>
            Replay welcome tour
          </Button>
          {(
            ['backup', 'prompts', 'shortcuts', 'doctor', 'projects', 'inbox', 'usage'] as const
          ).map((view) => (
            <Button key={view} variant="outline" onClick={() => props.onNavigate(view)}>
              {
                {
                  shortcuts: 'Keyboard shortcuts',
                  prompts: 'Saved prompts',
                  backup: 'Local backup',
                  doctor: 'Agent setup',
                  projects: 'Projects and editor',
                  inbox: 'Notifications',
                  usage: 'Usage alerts',
                }[view]
              }
            </Button>
          ))}
        </CardContent>
      </Card>
    </section>
  );
}
