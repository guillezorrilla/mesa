import type { DoctorReport } from '@mesa/core';
import { Check, CircleArrowUp, Plus, RefreshCw, Settings2, UserRound } from 'lucide-react';
import { type RefObject, useState } from 'react';
import { SectionLabel } from '@/components/SectionLabel';
import { describeUpdate, useUpdate } from '@/features/update/useUpdate';
import { NewProfileDialog } from './NewProfileDialog';
import { ProfileSummary } from './ProfileSummary';
import { useProfiles } from './useProfiles';

/**
 * The profile button and its popover: the profile summary, the profiles to switch to, updates, and
 * Settings. The button names the profile once there is more than one. `ref` is the popover's
 * `details`, so the command palette can open it.
 */
export function ProfileMenu(props: {
  ref: RefObject<HTMLDetailsElement | null>;
  doctor: DoctorReport | undefined;
  onSettings: () => void;
}) {
  const { status, busy, check } = useUpdate();
  const { profiles, refresh, switchTo } = useProfiles();
  const [creating, setCreating] = useState(false);
  const current = profiles?.find((profile) => profile.current)?.name;
  const close = () => {
    if (props.ref.current) props.ref.current.open = false;
  };
  return (
    // Read again on each open: Settings may have renamed or removed one meanwhile.
    <details
      ref={props.ref}
      className="relative shrink-0"
      onToggle={(event) => event.currentTarget.open && void refresh()}
    >
      <summary
        aria-label="Profile settings"
        className="flex h-8 min-w-8 cursor-pointer items-center justify-center gap-1.5 rounded-full border bg-card px-2 text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <UserRound aria-hidden className="size-4" />
        {profiles && profiles.length > 1 && current && (
          <span data-testid="profile-button-name" className="max-w-28 truncate text-xs">
            {current}
          </span>
        )}
      </summary>
      <div
        data-tauri-drag-region="false"
        className="absolute right-0 z-50 mt-2 w-64 select-text space-y-3 rounded-lg border bg-popover p-3 shadow-lg"
      >
        <ProfileSummary doctor={props.doctor} />
        {profiles?.length ? (
          <section aria-label="Profiles" className="space-y-1 border-t pt-2">
            <SectionLabel className="px-2">Profiles</SectionLabel>
            {profiles.map((profile) => (
              <button
                key={profile.name}
                type="button"
                data-testid="profile-choice"
                aria-current={profile.current || undefined}
                disabled={profile.current}
                className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent disabled:hover:bg-transparent"
                onClick={() => {
                  close();
                  void switchTo(profile.name);
                }}
              >
                <Check
                  aria-hidden
                  className={profile.current ? 'size-4 text-ring' : 'invisible size-4'}
                />
                <span className="truncate">{profile.name}</span>
              </button>
            ))}
            <button
              type="button"
              data-testid="new-profile"
              className="flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
              onClick={() => {
                close();
                setCreating(true);
              }}
            >
              <Plus aria-hidden className="size-4" /> New profile
            </button>
          </section>
        ) : null}
        {status?.phase === 'ready' && (
          <button
            type="button"
            data-testid="update-ready-entry"
            className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
            onClick={() => {
              close();
              void check();
            }}
          >
            <CircleArrowUp aria-hidden className="size-4 text-ring" /> Update ready: v
            {status.version}
          </button>
        )}
        <button
          type="button"
          data-testid="check-for-updates"
          disabled={busy}
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent disabled:opacity-60"
          onClick={() => {
            close();
            void check();
          }}
        >
          <RefreshCw aria-hidden className={busy ? 'size-4 animate-spin' : 'size-4'} /> Check for
          updates
        </button>
        {status && status.phase !== 'idle' && status.phase !== 'ready' && (
          <p data-testid="update-status" className="px-2 text-xs text-muted-foreground">
            {describeUpdate(status)}
          </p>
        )}
        <button
          type="button"
          data-testid="open-settings"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
          onClick={() => {
            close();
            props.onSettings();
          }}
        >
          <Settings2 aria-hidden className="size-4" /> Settings
        </button>
      </div>
      {creating && (
        <NewProfileDialog
          current={current ?? 'this profile'}
          taken={profiles?.map((profile) => profile.name) ?? []}
          onCancel={() => setCreating(false)}
          onCreated={switchTo}
        />
      )}
    </details>
  );
}
