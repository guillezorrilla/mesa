import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';

/** Explicit local backup and separate-profile restore; failed or cancelled picks change nothing. */
export function BackupScreen() {
  const run = useRun();
  const platform = usePlatform();
  const { acting, act } = useAct();
  const [created, setCreated] = useState('');
  const [file, setFile] = useState('');
  const [profile, setProfile] = useState('');
  const [vault, setVault] = useState('');
  const [restored, setRestored] = useState('');
  return (
    <section data-testid="backup-settings" className="max-w-3xl space-y-4">
      <PageHeader
        title="Local backup"
        description="Five most recent backups are retained in this profile."
      />
      <Card>
        <CardHeader>
          <CardTitle>Create backup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Includes profile settings, registered project paths, and saved prompts. Provider
            credentials, vault contents, session records, output logs, and tmux processes are
            excluded.
          </p>
          <Button
            disabled={acting}
            onClick={() =>
              void act(async () => {
                const result = await run('backup.create');
                if (result) setCreated(result.path);
                return undefined;
              })
            }
          >
            Create backup
          </Button>
          {created && (
            <p className="break-all font-mono text-xs" role="status">
              Saved to {created}
            </p>
          )}
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Restore into a new profile</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Choose a backup and an unused profile name and vault path. Restore does not copy a vault
            or touch existing profiles. Restart Mesa with the new profile to open it.
          </p>
          <div className="space-y-1">
            <Label htmlFor="backup-file">Backup file</Label>
            <div className="flex gap-2">
              <Input
                id="backup-file"
                value={file}
                onChange={(event) => setFile(event.currentTarget.value)}
              />
              <Button
                variant="outline"
                disabled={acting}
                onClick={() =>
                  void act(async () => {
                    const picked = await platform.pickFile();
                    if (picked) setFile(picked);
                    return undefined;
                  })
                }
              >
                Choose
              </Button>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="restore-profile">New profile name</Label>
            <Input
              id="restore-profile"
              value={profile}
              onChange={(event) => setProfile(event.currentTarget.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="restore-vault">New, unused vault path</Label>
            <Input
              id="restore-vault"
              value={vault}
              onChange={(event) => setVault(event.currentTarget.value)}
            />
          </div>
          <Button
            disabled={
              acting || !file || !/^[A-Za-z0-9_-]{1,64}$/.test(profile) || !vault.startsWith('/')
            }
            onClick={() =>
              void act(async () => {
                const result = await run('backup.restore', { file, profile, vault });
                if (result) setRestored(result.path);
                return undefined;
              })
            }
          >
            Restore profile
          </Button>
          {restored && (
            <p className="break-all font-mono text-xs" role="status">
              Restored to {restored}. Run mesa --profile {profile} vault init to create an empty
              vault, then restart Mesa with MESA_PROFILE={profile} to open it.
            </p>
          )}
        </CardContent>
      </Card>
    </section>
  );
}
