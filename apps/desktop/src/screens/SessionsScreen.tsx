import { useState } from 'react';
import { useToast } from '../components/Toast';
import { useCommand, useRun } from '../lib/useCommand';

// ponytail: a copy of duration() in packages/cli/src/format.ts, since the app bundles no CLI or
// core code; change both together, or share one pure module if a third copy appears.
const running = (seconds: number) => {
  const [h, m, s] = [Math.floor(seconds / 3600), Math.floor(seconds / 60) % 60, seconds % 60];
  const two = (n: number) => String(n).padStart(2, '0');
  if (h) return `${h}h${two(m)}m`;
  return m ? `${m}m${two(s)}s` : `${s}s`;
};

/** The profile's sessions with their last state; #27 turns this into the Board with its actions. */
export function SessionsScreen() {
  const [ended, setEnded] = useState(false);
  const { data, busy, refresh } = useCommand(ended ? 'sessions.all' : 'sessions.list');
  const run = useRun();
  const toast = useToast();
  const [opening, setOpening] = useState(false);
  // One at a time, so a double click opens one terminal window, not two.
  const openTerminal = async (id: string) => {
    setOpening(true);
    try {
      const attached = await run('sessions.attach', { id });
      if (attached) toast(`Opened ${attached.target} in ${attached.app}`);
    } finally {
      setOpening(false);
    }
  };
  return (
    <section data-testid="sessions-screen">
      <h2>Sessions</h2>
      <label>
        <input
          type="checkbox"
          data-testid="sessions-ended"
          checked={ended}
          onChange={(e) => setEnded(e.target.checked)}
        />{' '}
        Show ended
      </label>
      {data?.length === 0 && (
        <p data-testid="sessions-empty">
          No sessions yet: start one with mesa open &lt;project&gt;.
        </p>
      )}
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Project</th>
            <th>Agent</th>
            <th>State</th>
            <th>Running</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((s) => (
            <tr key={s.id} data-testid="session-row" data-alive={s.alive}>
              <td>{s.id}</td>
              <td>{s.project}</td>
              <td>{s.agent}</td>
              <td>{s.lastState.state}</td>
              <td>{running(s.runningSeconds)}</td>
              <td>
                {s.alive && (
                  <button
                    type="button"
                    data-testid="session-terminal"
                    onClick={() => openTerminal(s.id)}
                    disabled={opening}
                  >
                    Terminal
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button type="button" data-testid="sessions-refresh" onClick={refresh} disabled={busy}>
        {busy ? 'Refreshing...' : 'Refresh'}
      </button>
    </section>
  );
}
