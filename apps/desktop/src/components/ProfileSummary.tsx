import type { DoctorReport } from '@mesa/core';
import { useCommand, useRun } from '../lib/useCommand';

/** The header line: active profile, its vault and what the vault is missing, and doctor's verdict. */
export function ProfileSummary({ doctor }: { doctor: DoctorReport | undefined }) {
  const { data: profile } = useCommand('profile.get');
  const { data: config } = useCommand('config.get');
  const { data: vault } = useCommand('vault.status');
  const run = useRun();
  const missing = vault && !vault.ok ? ` (missing ${vault.missing.join(', ')})` : '';
  return (
    <p data-testid="profile-summary">
      <span data-testid="active-profile">Profile: {profile?.profile ?? '...'}</span>
      {' | '}
      <span data-testid="vault-status">
        Vault: {config ? config.vault : 'not initialised'}
        {missing}
      </span>{' '}
      {config && (
        <button type="button" data-testid="open-vault" onClick={() => run('vault.open')}>
          Open in Obsidian
        </button>
      )}
      {' | '}
      <span data-testid="doctor-health" style={{ color: doctor?.healthy ? 'green' : 'red' }}>
        {!doctor ? 'Doctor: ...' : doctor.healthy ? 'Doctor: ok' : 'Doctor: needs attention'}
      </span>
    </p>
  );
}
