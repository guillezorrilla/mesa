import type { DoctorReport } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

/** The active profile and doctor's verdict in the profile menu. */
export function ProfileSummary({ doctor }: { doctor: DoctorReport | undefined }) {
  const { data: profile } = useCommand('profile.get');
  const health = !doctor ? 'unknown' : doctor.healthy ? 'healthy' : 'unhealthy';
  return (
    <Muted data-testid="profile-summary" size="xs" className="flex flex-wrap items-center gap-x-1">
      <span data-testid="active-profile">Profile: {profile?.profile ?? '...'}</span>
      {' | '}
      <span
        data-testid="doctor-health"
        data-health={health}
        className={cn(
          health === 'healthy' && 'text-state-idle',
          health === 'unhealthy' && 'font-medium text-state-failed',
        )}
      >
        {!doctor ? 'Doctor: ...' : doctor.healthy ? 'Doctor: ok' : 'Doctor: needs attention'}
      </span>
    </Muted>
  );
}
