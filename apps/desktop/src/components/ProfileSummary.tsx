import type { DoctorReport } from '@mesa/core';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAct, warned } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';

/** The header line: active profile, its vault and what the vault is missing, and doctor's verdict. */
export function ProfileSummary({ doctor }: { doctor: DoctorReport | undefined }) {
  const { data: profile } = useCommand('profile.get');
  const { data: config } = useCommand('config.get');
  const { data: vault } = useCommand('vault.status');
  const run = useRun();
  const { acting, act } = useAct();
  const missing = vault && !vault.ok ? ` (missing ${vault.missing.join(', ')})` : '';
  const health = !doctor ? 'unknown' : doctor.healthy ? 'healthy' : 'unhealthy';
  return (
    <p
      data-testid="profile-summary"
      className="flex flex-wrap items-center gap-x-1 text-muted-foreground text-xs"
    >
      <span data-testid="active-profile">Profile: {profile?.profile ?? '...'}</span>
      {' | '}
      <span data-testid="vault-status">
        Vault: {config ? config.vault : 'not initialised'}
        {missing}
      </span>{' '}
      {config && (
        <Button
          variant="link"
          size="sm"
          className="h-auto px-1 text-xs"
          data-testid="open-vault"
          onClick={() => act(async () => warned((await run('vault.open'))?.warning))}
          disabled={acting}
        >
          Open in Obsidian
          <ExternalLink aria-hidden />
        </Button>
      )}
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
    </p>
  );
}
