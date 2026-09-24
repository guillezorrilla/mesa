import type { Check } from '@mesa/core';
import { useCommand } from '../lib/useCommand';

const MARK: Record<Check['status'], string> = { ok: '✓', warn: '!', fail: '✗' };

export function DoctorScreen() {
  const { data, busy, refresh } = useCommand('doctor.run');
  return (
    <section data-testid="doctor-panel">
      <h2>Doctor</h2>
      {data && !data.healthy && <p data-testid="doctor-summary">{data.summary}</p>}
      <table>
        <thead>
          <tr>
            <th>Check</th>
            <th>OK</th>
            <th>Version</th>
            <th>Hint</th>
          </tr>
        </thead>
        <tbody>
          {data?.checks.map((c) => (
            <tr key={c.name} data-testid="doctor-row" data-status={c.status}>
              <td>{c.name}</td>
              <td aria-label={c.status}>{MARK[c.status]}</td>
              <td>{c.version ?? ''}</td>
              <td>{c.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" data-testid="doctor-recheck" onClick={refresh} disabled={busy}>
        {busy ? 'Checking...' : 'Recheck'}
      </button>
    </section>
  );
}
