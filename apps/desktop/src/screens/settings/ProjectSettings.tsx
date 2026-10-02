import type { ProjectRow } from '@mesa/core';
import { TERMINAL_THEMES } from '@mesa/core/browser';
import { FolderGit2, GitBranch, Palette, Play, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ProjectSelect } from '../board/ProjectSelect';
import { commaList, lineList, TextField } from './controls';
import { options } from './GeneralSettings';
import { SettingRow, SettingSection } from './SettingRow';
import { useSettings } from './useSettings';

type Worktrees = NonNullable<ProjectRow['overrides']['worktrees']>;

/** A profile value as the row that would inherit it names it. */
const profileValue = (value: string | boolean | readonly string[] | undefined, none: string) => {
  const words =
    typeof value === 'boolean'
      ? value
        ? 'on'
        : 'off'
      : typeof value === 'string'
        ? value
        : value?.join(', ');
  return `Profile: ${words || none}`;
};

/** An empty field leaves the override out, so the profile's setting applies. */
const orInherit = (parse: (text: string) => { value: unknown }) => (text: string) => {
  const { value } = parse(text);
  return { value: Array.isArray(value) && !value.length ? undefined : value };
};
const branch = (text: string) => ({ value: text.trim() || undefined });

/**
 * One project's overrides of the profile's worktree settings and terminal theme, saved in its
 * mesa.yaml through `mesa projects set`; each row names the profile value it otherwise inherits.
 */
export function ProjectSettings(props: { onChanged: () => void }) {
  const { config } = useSettings();
  const projects = useCommand('projects.list');
  const run = useRun();
  const { acting, act } = useAct();
  const [chosen, setChosen] = useState<string>();
  const project =
    projects.data?.find((row) => row.name === chosen && row.exists) ??
    projects.data?.find((row) => row.exists);
  const worktrees: Worktrees = project?.overrides.worktrees ?? {};
  const profile = config.worktrees;
  const save = (path: string, value: unknown) =>
    void act(async () => {
      if (!project) return undefined;
      if (!(await run('projects.set', { name: project.name, path, value }))) return undefined;
      await projects.refresh();
      props.onChanged();
      return undefined;
    });
  const themes = options(TERMINAL_THEMES);
  return (
    <>
      <SettingSection
        id="project"
        title="Project"
        description="Settings a project overrides travel with it in its mesa.yaml"
      >
        <SettingRow
          icon={FolderGit2}
          title="Project"
          description={project ? project.path : 'Register a project to override settings for it.'}
          htmlFor="project-settings-project"
          control={
            <ProjectSelect
              id="project-settings-project"
              className="min-w-40"
              projects={projects.data}
              value={project?.name ?? ''}
              disabled={acting}
              onChange={(event) => setChosen(event.currentTarget.value)}
            />
          }
        />
      </SettingSection>
      {project && (
        <div key={project.name} className="space-y-8">
          <SettingSection
            id="project-terminal"
            title="Terminal"
            description="How this project's session terminals look"
          >
            <SettingRow
              icon={Palette}
              title="Terminal theme override"
              description={profileValue(
                themes.find(([value]) => value === config.terminal.theme)?.[1],
                'follow',
              )}
              keywords="project terminal theme"
              htmlFor="project-terminal-theme"
              control={
                <NativeSelect
                  id="project-terminal-theme"
                  className="min-w-40"
                  value={project.overrides.terminal?.theme ?? ''}
                  disabled={acting}
                  onChange={(event) =>
                    save('terminal.theme', event.currentTarget.value || undefined)
                  }
                >
                  <NativeSelectOption value="">Use profile setting</NativeSelectOption>
                  {themes.map(([value, label]) => (
                    <NativeSelectOption key={value} value={value}>
                      {label}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              }
            />
          </SettingSection>
          <SettingSection
            id="project-worktrees"
            title="Worktrees"
            description="What this project's new worktrees start with; an empty field uses the profile's"
          >
            <SettingRow
              icon={GitBranch}
              title="Default base branch"
              description={profileValue(profile.base, 'the current branch')}
              keywords="project base branch"
              htmlFor="project-worktree-base"
              control={
                <TextField
                  id="project-worktree-base"
                  value={worktrees.base ?? ''}
                  placeholder={profile.base ?? 'e.g. main'}
                  parse={branch}
                  onSave={(value) => save('worktrees.base', value)}
                />
              }
            />
            <SettingRow
              icon={RefreshCw}
              title="Fetch before creating worktree"
              description={profileValue(profile.fetch, 'off')}
              keywords="project fetch"
              htmlFor="project-worktree-fetch"
              control={
                <NativeSelect
                  id="project-worktree-fetch"
                  className="min-w-40"
                  value={worktrees.fetch === undefined ? '' : String(worktrees.fetch)}
                  disabled={acting}
                  onChange={(event) => {
                    const value = event.currentTarget.value;
                    save('worktrees.fetch', value ? value === 'true' : undefined);
                  }}
                >
                  <NativeSelectOption value="">Use profile setting</NativeSelectOption>
                  <NativeSelectOption value="true">On</NativeSelectOption>
                  <NativeSelectOption value="false">Off</NativeSelectOption>
                </NativeSelect>
              }
            />
            <SettingRow
              title="Include .gitignored folders in worktree"
              description={profileValue(profile.carryIgnoredDirectories, 'none')}
              keywords="project carry ignored"
              htmlFor="project-worktree-carry"
              control={
                <TextField
                  id="project-worktree-carry"
                  value={worktrees.carryIgnoredDirectories?.join(', ') ?? ''}
                  placeholder="e.g. node_modules, .env.local"
                  parse={orInherit(commaList)}
                  onSave={(value) => save('worktrees.carryIgnoredDirectories', value)}
                />
              }
            />
            <SettingRow
              title="Sparse checkout directories"
              description={profileValue(profile.sparseDirectories, 'everything')}
              keywords="project sparse"
              htmlFor="project-worktree-sparse"
              control={
                <TextField
                  id="project-worktree-sparse"
                  value={worktrees.sparseDirectories?.join(', ') ?? ''}
                  placeholder="e.g. apps/web, packages"
                  parse={orInherit(commaList)}
                  onSave={(value) => save('worktrees.sparseDirectories', value)}
                />
              }
            />
          </SettingSection>
          <SettingSection
            id="project-scripts"
            title="Scripts"
            description="This project's worktree setup and teardown; empty uses the profile's"
          >
            <SettingRow
              icon={Play}
              title="Bootstrap script"
              description={profileValue(profile.setup, 'none')}
              keywords="project setup"
              htmlFor="project-worktree-setup"
            >
              <TextField
                id="project-worktree-setup"
                multiline
                value={worktrees.setup?.join('\n') ?? ''}
                placeholder="e.g. pnpm install"
                parse={orInherit(lineList)}
                onSave={(value) => save('worktrees.setup', value)}
              />
            </SettingRow>
            <SettingRow
              icon={Trash2}
              title="Teardown script"
              description={profileValue(profile.teardown, 'none')}
              keywords="project teardown"
              htmlFor="project-worktree-teardown"
            >
              <TextField
                id="project-worktree-teardown"
                multiline
                value={worktrees.teardown?.join('\n') ?? ''}
                parse={orInherit(lineList)}
                onSave={(value) => save('worktrees.teardown', value)}
              />
            </SettingRow>
          </SettingSection>
        </div>
      )}
    </>
  );
}
