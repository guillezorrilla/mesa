import { profileSlug, profileVault, validProfileName } from '@mesa/core/browser';
import { FolderOpen, UserPlus } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * A new profile: its name (as the slug it becomes), its own vault, new or existing, and whether
 * it starts from the current profile's settings. Created, the app switches to it, where its
 * setup guide runs.
 */
export function NewProfileDialog(props: {
  current: string;
  taken: string[];
  onCancel: () => void;
  onCreated: (name: string) => Promise<void>;
}) {
  const [label, setLabel] = useState('');
  const [vaultKind, setVaultKind] = useState<'new' | 'existing'>('new');
  const [existing, setExisting] = useState('');
  const [copySettings, setCopySettings] = useState(false);
  const { data: choices } = useCommand('obsidian.vaults');
  const { pickFolder } = usePlatform();
  const { acting, act } = useAct();
  const run = useRun();
  const name = profileSlug(label);
  const problem = !label.trim()
    ? undefined
    : !validProfileName(name)
      ? 'Use letters or digits.'
      : props.taken.includes(name)
        ? `A profile named ${name} already exists.`
        : undefined;
  const ready = validProfileName(name) && !problem && (vaultKind === 'new' || Boolean(existing));
  const newVault = choices && name ? profileVault(choices.suggested, name) : undefined;
  return (
    <ActionDialog
      testId="new-profile-dialog"
      title={
        <span className="flex items-center gap-2">
          <UserPlus aria-hidden className="size-5 text-ring" />
          New profile
        </span>
      }
      description="A separate Mesa with its own projects, sessions, vault and keys."
      submit={{ label: 'Create and switch', testId: 'create-profile', disabled: acting || !ready }}
      onCancel={() => !acting && props.onCancel()}
      onSubmit={() => {
        if (!ready) return;
        void act(async () => {
          const created = await run('profile.create', {
            name,
            ...(vaultKind === 'existing' ? { vault: existing } : {}),
            copySettings,
          });
          if (created) await props.onCreated(created.profile);
          return undefined;
        });
      }}
    >
      <div className="space-y-2">
        <Label htmlFor="profile-name">Name</Label>
        <Input
          id="profile-name"
          placeholder="Client work"
          value={label}
          maxLength={64}
          disabled={acting}
          aria-invalid={Boolean(problem)}
          onChange={(event) => setLabel(event.target.value)}
        />
        <Muted size="xs" data-testid="profile-slug" role={problem ? 'alert' : undefined}>
          {problem ?? (name ? `Saved as ${name}` : 'Letters, digits, - and _ are kept.')}
        </Muted>
      </div>
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Vault</legend>
        <RadioGroup
          aria-label="Vault"
          value={vaultKind}
          onValueChange={(value) => setVaultKind(value as 'new' | 'existing')}
        >
          <div className="flex items-start gap-2">
            <RadioGroupItem id="vault-new" value="new" disabled={acting} />
            <Label htmlFor="vault-new" className="grid gap-1 font-normal">
              Create a new vault
              {newVault && (
                <span className="break-all font-mono text-xs text-muted-foreground">
                  {newVault}
                </span>
              )}
            </Label>
          </div>
          <div className="flex items-start gap-2">
            <RadioGroupItem id="vault-existing" value="existing" disabled={acting} />
            <Label htmlFor="vault-existing" className="grid gap-1 font-normal">
              Use an existing vault
              {existing && (
                <span className="break-all font-mono text-xs text-muted-foreground">
                  {existing}
                </span>
              )}
            </Label>
          </div>
        </RadioGroup>
        {vaultKind === 'existing' && (
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() =>
              void act(async () => {
                const chosen = await pickFolder();
                if (chosen) setExisting(chosen);
                return undefined;
              })
            }
          >
            <FolderOpen aria-hidden /> Choose folder
          </Button>
        )}
      </fieldset>
      <div className="flex items-center gap-2">
        <Checkbox
          id="copy-settings"
          checked={copySettings}
          disabled={acting}
          onCheckedChange={(checked) => setCopySettings(checked === true)}
        />
        <Label htmlFor="copy-settings" className="font-normal">
          Copy settings from {props.current} (not its keys or sessions)
        </Label>
      </div>
    </ActionDialog>
  );
}
