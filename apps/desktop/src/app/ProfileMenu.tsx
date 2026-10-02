import type { DoctorReport } from '@mesa/core';
import { Settings2, UserRound } from 'lucide-react';
import type { RefObject } from 'react';
import { ProfileSummary } from '@/features/profile/ProfileSummary';

/**
 * The profile button and its popover: the profile summary and Settings. `ref` is the
 * popover's `details`, so the command palette can open it.
 */
export function ProfileMenu(props: {
  ref: RefObject<HTMLDetailsElement | null>;
  doctor: DoctorReport | undefined;
  onSettings: () => void;
}) {
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
        <button
          type="button"
          data-testid="open-settings"
          className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-sm hover:bg-accent"
          onClick={() => {
            if (props.ref.current) props.ref.current.open = false;
            props.onSettings();
          }}
        >
          <Settings2 aria-hidden className="size-4" /> Settings
        </button>
      </div>
    </details>
  );
}
