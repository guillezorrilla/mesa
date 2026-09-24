import { invoke } from '@tauri-apps/api/core';
import { useEffect, useState } from 'react';

// Accepts a bare object or an { ok, data } envelope so a CLI envelope change does not break this.
function readProfile(value: unknown): string {
  const obj = value as { data?: unknown; profile?: unknown } | null;
  const body = (obj && 'data' in obj ? obj.data : obj) as { profile?: unknown } | null;
  if (typeof body?.profile !== 'string')
    throw new Error(`unexpected output: ${JSON.stringify(value)}`);
  return body.profile;
}

export function App() {
  const [profile, setProfile] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke('run_mesa', { args: ['profile', '--json'] })
      .then((value) => setProfile(readProfile(value)))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : String(e)));
  }, []);

  return (
    <main>
      <h1 data-testid="app-name">Mesa</h1>
      <p data-testid="active-profile">Profile: {profile ?? '...'}</p>
      {error && <pre data-testid="error">{error}</pre>}
    </main>
  );
}
