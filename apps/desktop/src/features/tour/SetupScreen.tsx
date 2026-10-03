import type { DoctorReport } from '@mesa/core';
import { AGENT_EXECUTABLES } from '@mesa/core/browser';
import { Copy, FolderOpen, RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { DoctorChecksPanel } from '@/features/doctor/DoctorChecksPanel';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { type CommandState, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

/** The doctor checks a session needs: tmux and the agents, each named by its executable. */
const NEEDED: readonly string[] = ['tmux', ...Object.values(AGENT_EXECUTABLES)];

/** The README's link that puts the app's `mesa` on a terminal's PATH. */
const LINK_COMMAND =
  'mkdir -p ~/.local/bin && ln -s /Applications/Mesa.app/Contents/MacOS/mesa ~/.local/bin/mesa';

/**
 * The first launch with no profile: `mesa init` with a chosen vault, then the doctor's tmux and
 * agent checks with their hints. The doctor state is the App's, as on the Doctor screen.
 */
export function SetupScreen(props: {
  doctor: CommandState<DoctorReport>;
  /** `config.get` answers: the profile exists. */
  profileExists: boolean;
  onInitialised: () => Promise<void>;
  onContinue: () => void;
}) {
  const { doctor, profileExists } = props;
  const [vault, setVault] = useState('');
  const { pickFolder, clipboard } = usePlatform();
  const { acting, act } = useAct();
  const run = useRun();
  const report = doctor.data && {
    ...doctor.data,
    checks: doctor.data.checks.filter((check) => NEEDED.includes(check.name)),
  };
  const create = () =>
    void act(async () => {
      if (!(await run('profile.init', { vault: vault.trim() }))) return undefined;
      await props.onInitialised();
      return undefined;
    });
  return (
    <section data-testid="setup-screen" className="mx-auto max-w-2xl space-y-4">
      <PageHeader
        title="Set up Mesa"
        description="Choose where Mesa keeps its memory, then check what sessions need."
      />
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Vault</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Label htmlFor="setup-vault">Vault folder</Label>
          <Muted>Your local Obsidian vault folder. Mesa writes its notes there.</Muted>
          <div className="flex items-center gap-2">
            <Input
              id="setup-vault"
              data-testid="setup-vault"
              placeholder="/path/to/vault"
              className="font-mono"
              value={vault}
              disabled={acting || profileExists}
              onChange={(event) => setVault(event.target.value)}
            />
            <Button
              variant="outline"
              disabled={acting || profileExists}
              onClick={() =>
                void act(async () => {
                  const chosen = await pickFolder();
                  if (chosen) setVault(chosen);
                  return undefined;
                })
              }
            >
              <FolderOpen aria-hidden /> Choose
            </Button>
          </div>
          <Button
            data-testid="setup-create"
            disabled={acting || profileExists || !vault.trim()}
            onClick={create}
          >
            {profileExists ? 'Profile created' : 'Create profile'}
          </Button>
        </CardContent>
      </Card>
      {profileExists && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="font-medium">tmux and agents</h3>
            <Button
              variant="outline"
              data-testid="setup-recheck"
              disabled={doctor.busy}
              onClick={() => void doctor.refresh()}
            >
              <RefreshCw aria-hidden className={cn(doctor.busy && 'animate-spin')} />
              {doctor.busy ? 'Checking...' : 'Recheck'}
            </Button>
          </div>
          <DoctorChecksPanel report={report} />
        </div>
      )}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Use mesa from a terminal</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <Muted>Sessions Mesa starts already find it. To run it yourself, link it once:</Muted>
          <div className="flex items-center gap-2">
            <code
              data-testid="setup-link-command"
              className="min-w-0 flex-1 overflow-x-auto rounded-md bg-muted px-3 py-2 font-mono text-xs"
            >
              {LINK_COMMAND}
            </code>
            <Button
              variant="outline"
              data-testid="setup-copy"
              onClick={() =>
                void act(async () => {
                  await clipboard.write(LINK_COMMAND);
                  return said('Command copied');
                })
              }
            >
              <Copy aria-hidden /> Copy
            </Button>
          </div>
        </CardContent>
      </Card>
      <div className="flex justify-end">
        <Button
          data-testid="setup-continue"
          disabled={acting || !profileExists}
          onClick={props.onContinue}
        >
          Continue
        </Button>
      </div>
    </section>
  );
}
