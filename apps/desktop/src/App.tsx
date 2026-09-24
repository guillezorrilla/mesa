import type { Check } from '@mesa/core';
import { useCallback, useEffect, useState } from 'react';
import { load } from './lib/mesa';

function DoctorPanel({ onError }: { onError: (text: string) => void }) {
  const [checks, setChecks] = useState<Check[] | null>(null);
  const [busy, setBusy] = useState(false);

  const recheck = useCallback(async () => {
    setBusy(true);
    const data = await load('doctor.run', onError);
    if (data) setChecks(data);
    setBusy(false);
  }, [onError]);

  useEffect(() => {
    recheck();
  }, [recheck]);

  return (
    <section data-testid="doctor-panel">
      <h2>Doctor</h2>
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
          {checks?.map((c) => (
            <tr key={c.name} data-testid="doctor-row">
              <td>{c.name}</td>
              <td aria-label={c.ok ? 'ok' : 'not ok'}>{c.ok ? '✓' : '✗'}</td>
              <td>{c.version ?? ''}</td>
              <td>{c.hint}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" data-testid="doctor-recheck" onClick={recheck} disabled={busy}>
        {busy ? 'Checking...' : 'Recheck'}
      </button>
    </section>
  );
}

export function App() {
  const [profile, setProfile] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    load('profile.get', setToast).then((data) => data && setProfile(data.profile));
  }, []);

  return (
    <main>
      <header>
        <h1 data-testid="app-name">Mesa</h1>
        <p data-testid="active-profile">Profile: {profile ?? '...'}</p>
        {/* ponytail: one screen, so no router; add one when the Board lands. */}
        <nav>
          <button type="button" aria-current="page">
            Doctor
          </button>
        </nav>
      </header>
      <DoctorPanel onError={setToast} />
      {toast && (
        <div role="alert" data-testid="toast" className="toast">
          <pre>{toast}</pre>
          <button type="button" onClick={() => setToast(null)}>
            Dismiss
          </button>
        </div>
      )}
    </main>
  );
}
