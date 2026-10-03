import type { DoctorReport } from '@mesa/core';
import { CircleArrowUp, RefreshCw, Settings2, UserRound } from 'lucide-react';
import type { RefObject } from 'react';
import { ProfileSummary } from '@/features/profile/ProfileSummary';
import { describeUpdate, useUpdate } from '@/features/update/useUpdate';

/**
 * The profile button and its popover: the profile summary, updates, and Settings. `ref` is the
 * popover's `details`, so the command palette can open it.
 */
export function ProfileMenu(props: {
  ref: RefObject<HTMLDetailsElement | null>;
  doctor: DoctorReport | undefined;
  onSettings: () => void;
}) {
  const { status, busy, check } = useUpdate();
  const close = () => {
    if (props.ref.current) props.ref.current.open = false;
  };
  return (
    <details ref={props.ref} className="relative shrink-0">
      <summary
        aria-label="Profile settings"
        className="flex size-8 cursor-pointer items-center justify-center rounded-full border bg-card text-sm hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
      >
        <UserRound aria-hidden className="size-4" />
      </summary>
      <div
        data-tauri-drag-region="false"
        className="absolute right-0 z-50 mt-2 w-64 select-text space-y-3 rounded-lg border bg-popover p-3 shadow-lg"
      >
        <ProfileSummary doctor={props.doctor} />
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
    </details>
  );
}
