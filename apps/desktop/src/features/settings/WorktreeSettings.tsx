import type { Config } from '@mesa/core';
import {
  FolderTree,
  GitBranch,
  GitBranchMinus,
  GitFork,
  Play,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import { useState } from 'react';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { Switch } from '@/components/ui/switch';
import { TextField } from './controls/TextField';
import { commaList, lineList } from './controls/textLists';
import { SettingRow } from './SettingRow';
import { SettingSection } from './SettingSection';
import { useSettings } from './useSettings';

const LOCATIONS = [
  ['profile', 'In the profile'],
  ['sibling', 'Next to the project'],
  ['nested', 'Inside the project'],
  ['custom', 'A folder you choose'],
] as const;

/** Where worktrees go and what each new one gets; saved whole, so a cleared field is removed. */
export function WorktreeSettings() {
  const { config, acting, save } = useSettings();
  const worktrees = config.worktrees;
  const [choosingRoot, setChoosingRoot] = useState(false);
  const update = (patch: Partial<Config['worktrees']>) =>
    save('worktrees', { ...worktrees, ...patch });
  const custom = worktrees.location === 'custom' || choosingRoot;
  return (
    <>
      <SettingSection
        id="worktrees"
        title="Worktrees"
        description="Where new worktrees are created and what they start with"
        group="Worktrees"
        groupIcon={GitFork}
      >
        <SettingRow
          icon={FolderTree}
          title="Worktree location"
          description="Where new worktrees are created relative to the project"
          htmlFor="worktree-location"
          control={
            <NativeSelect
              id="worktree-location"
              className="min-w-40"
              value={choosingRoot ? 'custom' : worktrees.location}
              disabled={acting}
              onChange={(event) => {
                const location = event.currentTarget.value as Config['worktrees']['location'];
                // A custom location needs its folder first; the root field saves both.
                if (location === 'custom' && !worktrees.customRoot) return setChoosingRoot(true);
                setChoosingRoot(false);
                update({ location });
              }}
            >
              {LOCATIONS.map(([value, text]) => (
                <NativeSelectOption key={value} value={value}>
                  {text}
                </NativeSelectOption>
              ))}
            </NativeSelect>
          }
        />
        {custom && (
          <SettingRow
            title="Custom worktree folder"
            description="An absolute folder; each project's worktrees go inside it."
            htmlFor="worktree-root"
            control={
              <TextField
                id="worktree-root"
                value={worktrees.customRoot ?? ''}
                placeholder="e.g. /Users/you/worktrees"
                parse={(text) =>
                  text.startsWith('/') ? { value: text } : { error: 'Enter an absolute path.' }
                }
                onSave={(customRoot) => {
                  setChoosingRoot(false);
                  update({ location: 'custom', customRoot: customRoot as string });
                }}
              />
            }
          />
        )}
        <SettingRow
          icon={GitBranch}
          title="Default base branch"
          description="Branch to always check out new worktrees from; empty uses the current branch."
          htmlFor="worktree-base"
          control={
            <TextField
              id="worktree-base"
              value={worktrees.base ?? ''}
              placeholder="e.g. main"
              parse={(text) => ({ value: text.trim() || undefined })}
              onSave={(base) => update({ base: base as string | undefined })}
            />
          }
        />
        <SettingRow
          icon={RefreshCw}
          title="Fetch before creating worktree"
          description="Run git fetch origin before checkout."
          htmlFor="worktree-fetch"
          control={
            <Switch
              id="worktree-fetch"
              checked={worktrees.fetch}
              disabled={acting}
              onCheckedChange={(fetch) => update({ fetch })}
            />
          }
        />
        <SettingRow
          title="Include .gitignored folders in worktree"
          description="Top-level ignored folders to carry into new worktrees, comma separated."
          htmlFor="worktree-carry"
          control={
            <TextField
              id="worktree-carry"
              value={worktrees.carryIgnoredDirectories.join(', ')}
              placeholder="e.g. node_modules, .env.local"
              parse={commaList}
              onSave={(value) => update({ carryIgnoredDirectories: value as string[] })}
            />
          }
        />
        <SettingRow
          title="Sparse checkout directories"
          description="Only check out these folders when creating worktrees, comma separated."
          htmlFor="worktree-sparse"
          control={
            <TextField
              id="worktree-sparse"
              value={worktrees.sparseDirectories.join(', ')}
              placeholder="e.g. apps/web, packages"
              parse={commaList}
              onSave={(value) => update({ sparseDirectories: value as string[] })}
            />
          }
        />
      </SettingSection>
      <SettingSection
        id="scripts"
        title="Scripts"
        description="Worktree setup and teardown scripts"
      >
        <SettingRow
          icon={Play}
          title="Bootstrap script"
          description="Runs in a new worktree after checkout. The executable and its arguments, one per line; runs without a shell."
          htmlFor="worktree-setup"
        >
          <TextField
            id="worktree-setup"
            multiline
            value={worktrees.setup.join('\n')}
            placeholder={'pnpm\ninstall'}
            parse={lineList}
            onSave={(value) => update({ setup: value as string[] })}
          />
        </SettingRow>
        <SettingRow
          icon={Trash2}
          title="Teardown script"
          description="Runs before a worktree folder is deleted. The executable and its arguments, one per line; runs without a shell."
          htmlFor="worktree-teardown"
        >
          <TextField
            id="worktree-teardown"
            multiline
            value={worktrees.teardown.join('\n')}
            parse={lineList}
            onSave={(value) => update({ teardown: value as string[] })}
          />
        </SettingRow>
      </SettingSection>
      <SettingSection
        id="cleanup"
        title="Cleanup"
        description="What removing a worktree takes with it"
      >
        <SettingRow
          icon={GitBranchMinus}
          title="Delete branch by default"
          description='When removing a worktree, pre-check the "also delete branch" option.'
          htmlFor="worktree-delete-branch"
          control={
            <Switch
              id="worktree-delete-branch"
              checked={worktrees.deleteBranch}
              disabled={acting}
              onCheckedChange={(deleteBranch) => update({ deleteBranch })}
            />
          }
        />
      </SettingSection>
    </>
  );
}
