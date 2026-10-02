import { FolderOpen, FolderPlus, Plus } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

export function AddProjectDialog(props: {
  onCancel: () => void;
  onRegistered: () => Promise<void>;
  returnFocus?: HTMLElement | null;
  needsProfileSetup?: boolean;
  onInitialised?: () => Promise<void>;
}) {
  const [path, setPath] = useState('');
  const [name, setName] = useState('');
  const [vault, setVault] = useState('');
  const { pickFolder } = usePlatform();
  const { acting, act } = useAct();
  const run = useRun();
  return (
    <ActionDialog
      testId="add-project-dialog"
      title={
        <span className="flex items-center gap-2">
          <FolderPlus aria-hidden className="size-5 text-ring" />
          Add project
        </span>
      }
      description="Choose a local project folder."
      submit={{
        label: (
          <>
            <Plus aria-hidden /> Add
          </>
        ),
        testId: 'register-folder',
        disabled: acting || !path.trim() || Boolean(props.needsProfileSetup && !vault.trim()),
      }}
      onCancel={() => !acting && props.onCancel()}
      returnFocus={props.returnFocus}
      onSubmit={() => {
        if (!path.trim() || (props.needsProfileSetup && !vault.trim())) return;
        void act(async () => {
          if (props.needsProfileSetup) {
            if (!(await run('profile.init', { vault: vault.trim() }))) return undefined;
            await props.onInitialised?.();
          }
          const label = name.trim();
          const registered = await run('projects.register', {
            path: path.trim(),
            ...(label ? { label } : {}),
          });
          if (!registered) return undefined;
          await props.onRegistered();
          props.onCancel();
          return said(`Added project ${registered.label ?? registered.name}`, registered);
        });
      }}
    >
      {props.needsProfileSetup && (
        <div className="space-y-2">
          <Label htmlFor="project-vault">Vault folder</Label>
          <Muted>Choose your local Obsidian vault folder to set up Mesa.</Muted>
          <div className="flex items-center gap-2">
            <Input
              id="project-vault"
              placeholder="/path/to/vault"
              className="font-mono"
              value={vault}
              disabled={acting}
              onChange={(event) => setVault(event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Choose vault folder"
              disabled={acting}
              onClick={() =>
                void act(async () => {
                  const chosen = await pickFolder();
                  if (chosen) setVault(chosen);
                  return undefined;
                })
              }
            >
              <FolderOpen aria-hidden />
            </Button>
          </div>
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="project-path">Path</Label>
        <div className="flex items-center gap-2">
          <Input
            id="project-path"
            data-testid="project-path"
            placeholder="/path/to/project"
            className="font-mono"
            value={path}
            disabled={acting}
            onChange={(event) => setPath(event.target.value)}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label="Choose project folder"
            disabled={acting}
            onClick={() =>
              void act(async () => {
                const chosen = await pickFolder();
                if (chosen) setPath(chosen);
                return undefined;
              })
            }
          >
            <FolderOpen aria-hidden />
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="project-name">Name (optional)</Label>
        <Input
          id="project-name"
          placeholder="My project"
          value={name}
          maxLength={80}
          disabled={acting}
          onChange={(event) => setName(event.target.value)}
        />
      </div>
    </ActionDialog>
  );
}
