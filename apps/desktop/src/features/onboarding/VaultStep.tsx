import { FolderOpen } from 'lucide-react';
import { useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { InstallButton } from '@/features/doctor/InstallButton';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

/**
 * Where Mesa keeps its memory: one of Obsidian's vaults, most recent first, a new folder, or
 * another one. Continue creates the profile, which lays the vault out. Without Obsidian it offers
 * to install it; Mesa works without it, the notes are plain Markdown either way.
 */
export function VaultStep(props: {
  obsidian: boolean;
  onObsidianInstalled: () => Promise<void>;
  onCreated: () => Promise<void>;
}) {
  const choices = useCommand('obsidian.vaults');
  const { pickFolder } = usePlatform();
  const run = useRun();
  const { acting, act } = useAct();
  const [other, setOther] = useState<string>();
  const [chosen, setChosen] = useState<string>();
  const options = choices.data
    ? [
        ...choices.data.vaults.map((v) => ({ path: v.path, title: v.name })),
        { path: choices.data.suggested, title: 'Create a new vault' },
        ...(other ? [{ path: other, title: 'Another folder' }] : []),
      ]
    : [];
  // Without Obsidian, a stale vault list is no reason to pick an old vault: a new one is. That
  // holds after Install too, so a missing Obsidian is remembered for the step.
  const missing = useRef(false);
  if (!props.obsidian) missing.current = true;
  const selected = chosen ?? (missing.current ? choices.data?.suggested : options[0]?.path);
  const create = () =>
    act(async () => {
      if (!selected || !(await run('profile.init', { vault: selected }))) return undefined;
      await props.onCreated();
      return undefined;
    });
  return (
    <div className="space-y-4">
      <Muted>
        Mesa keeps notes, decisions and receipts as plain Markdown in an Obsidian vault on this Mac.
      </Muted>
      {!props.obsidian && (
        <Alert data-testid="obsidian-missing">
          <AlertDescription className="space-y-2">
            <p>
              Obsidian is not installed. It is how you read and edit Mesa's notes; you can install
              it now or later from Doctor.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <InstallButton name="obsidian" onInstalled={props.onObsidianInstalled} />
              <Button
                variant="link"
                size="sm"
                onClick={() => void run('browser.external', { url: 'https://obsidian.md' })}
              >
                Download from obsidian.md
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}
      <RadioGroup aria-label="Vault" value={selected ?? ''} onValueChange={setChosen}>
        {options.map((option, index) => (
          <div
            key={option.path}
            data-testid="vault-choice"
            className="flex items-start gap-3 rounded-md border px-3 py-2 text-sm has-[[data-state=checked]]:border-primary"
          >
            <RadioGroupItem id={`vault-${index}`} value={option.path} className="mt-0.5" />
            <Label htmlFor={`vault-${index}`} className="block min-w-0 cursor-pointer font-normal">
              <span className="block font-medium">{option.title}</span>
              <span className="block truncate font-mono text-muted-foreground text-xs">
                {option.path}
              </span>
            </Label>
          </div>
        ))}
      </RadioGroup>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="ghost"
          size="sm"
          disabled={acting}
          onClick={() =>
            void act(async () => {
              const folder = await pickFolder();
              if (folder) {
                setOther(folder);
                setChosen(folder);
              }
              return undefined;
            })
          }
        >
          <FolderOpen aria-hidden /> Choose another folder...
        </Button>
      </div>
      <div className="flex justify-end">
        <Button
          data-testid="onboarding-continue"
          disabled={acting || !selected}
          onClick={() => void create()}
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
