import { FolderOpen } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { ChoiceRow } from './ChoiceRow';

/**
 * Where Mesa keeps its memory: one of Obsidian's vaults, most recent first, a new folder, or
 * another one. Continue creates the profile, which lays the vault out.
 */
export function VaultStep(props: { obsidian: boolean; onCreated: () => Promise<void> }) {
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
  const selected = chosen ?? options[0]?.path;
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
      <div className="space-y-2" role="radiogroup" aria-label="Vault">
        {options.map((option) => (
          <ChoiceRow
            key={option.path}
            testId="vault-choice"
            type="radio"
            name="vault"
            checked={option.path === selected}
            onChange={() => setChosen(option.path)}
            title={option.title}
            detail={option.path}
          />
        ))}
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
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
        {!props.obsidian && (
          <Button
            variant="link"
            size="sm"
            onClick={() => void run('browser.external', { url: 'https://obsidian.md' })}
          >
            Get Obsidian
          </Button>
        )}
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
