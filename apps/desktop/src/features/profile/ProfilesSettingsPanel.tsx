import type { ProfileRow } from '@mesa/core';
import { profileSlug, validProfileName } from '@mesa/core/browser';
import { FolderOpen, Pencil, Trash2, UserRound } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SettingRow } from '@/features/settings/SettingRow';
import { SettingSection } from '@/features/settings/SettingSection';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { useProfiles } from './useProfiles';

/** Settings > General's Profiles: each one with Rename, Open folder and Remove. */
export function ProfilesSettingsPanel() {
  const { profiles, refresh, switchTo } = useProfiles();
  return (
    <SettingSection
      id="profiles"
      title="Profiles"
      description="Separate Mesas on this Mac, each with its own projects, sessions, vault and keys"
    >
      {profiles?.map((profile) => (
        <ProfileSetting
          key={profile.name}
          profile={profile}
          taken={profiles.map((p) => p.name)}
          onChanged={refresh}
          onRenamedCurrent={switchTo}
        />
      ))}
    </SettingSection>
  );
}

function ProfileSetting(props: {
  profile: ProfileRow;
  taken: string[];
  onChanged: () => Promise<void>;
  onRenamedCurrent: (name: string) => Promise<void>;
}) {
  const { profile } = props;
  const [editing, setEditing] = useState<'rename' | 'remove'>();
  const [typed, setTyped] = useState('');
  const { acting, act } = useAct();
  const run = useRun();
  const renamed = profileSlug(typed);
  const canRename =
    validProfileName(renamed) && renamed !== profile.name && !props.taken.includes(renamed);
  const busy = profile.liveSessions > 0;
  const toggle = (next: 'rename' | 'remove') => {
    setTyped('');
    setEditing(editing === next ? undefined : next);
  };
  return (
    <SettingRow
      icon={UserRound}
      title={profile.current ? `${profile.name} (this profile)` : profile.name}
      description={`${profile.projects} projects, ${profile.liveSessions} live sessions, vault ${profile.vault ?? 'unreadable'}`}
      keywords="profile rename remove folder"
      control={
        <span className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={acting}
            aria-label={`Rename ${profile.name}`}
            onClick={() => toggle('rename')}
          >
            <Pencil aria-hidden /> Rename
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={acting}
            aria-label={`Open ${profile.name}'s folder`}
            onClick={() => void act(async () => void (await run('profile.open', profile)))}
          >
            <FolderOpen aria-hidden /> Open folder
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="text-destructive"
            disabled={acting || profile.current}
            title={profile.current ? 'Switch to another profile first' : undefined}
            aria-label={`Remove ${profile.name}`}
            onClick={() => toggle('remove')}
          >
            <Trash2 aria-hidden /> Remove
          </Button>
        </span>
      }
    >
      {editing === 'rename' && (
        <form
          className="flex items-center gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!canRename) return;
            void act(async () => {
              if (!(await run('profile.rename', { from: profile.name, to: renamed }))) return;
              if (profile.current) await props.onRenamedCurrent(renamed);
              else await props.onChanged();
              setEditing(undefined);
              return undefined;
            });
          }}
        >
          <Input
            aria-label={`New name for ${profile.name}`}
            placeholder={profile.name}
            value={typed}
            disabled={acting}
            autoFocus
            onChange={(event) => setTyped(event.target.value)}
          />
          <Button type="submit" size="sm" disabled={acting || busy || !canRename}>
            Rename to {renamed || '...'}
          </Button>
        </form>
      )}
      {editing === 'remove' && (
        <form
          data-testid="remove-profile"
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (typed !== profile.name) return;
            void act(async () => {
              const removed = await run('profile.remove', profile);
              if (!removed) return undefined;
              await props.onChanged();
              return { text: `Removed profile ${profile.name}`, tone: 'confirmation' };
            });
          }}
        >
          <Muted size="xs">
            Stops its sessions' server, forgets its projects and keys; your vault at{' '}
            <span className="break-all font-mono">{profile.vault}</span> is kept.
          </Muted>
          <div className="flex items-center gap-2">
            <Input
              aria-label={`Type ${profile.name} to confirm`}
              placeholder={`Type ${profile.name} to confirm`}
              value={typed}
              disabled={acting}
              autoFocus
              onChange={(event) => setTyped(event.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant="destructive"
              disabled={acting || busy || typed !== profile.name}
            >
              Remove {profile.name}
            </Button>
          </div>
          {busy && (
            <Muted size="xs" role="alert">
              Stop its sessions first.
            </Muted>
          )}
        </form>
      )}
    </SettingRow>
  );
}
