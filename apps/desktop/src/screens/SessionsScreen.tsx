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

const percent = (p: number) => `${Math.round(p * 100)}%`;

/**
 * The profile's sessions and, read-only, agent sessions Mesa did not start, highest attention
 * first, with Faro's state, confidence, and attention; #27 turns this into the Board.
 */
export function SessionsScreen() {
  const [ended, setEnded] = useState(false);
  const { data, busy, refresh } = useCommand(ended ? 'sessions.all' : 'sessions.list');
  const run = useRun();
  const toast = useToast();
  const [acting, setActing] = useState(false);
  // One action at a time, so a double click opens one terminal or one session, not two.
  const act = async (action: () => Promise<string | undefined>) => {
    setActing(true);
    try {
      const said = await action();
      if (said) toast(said);
    } finally {
      setActing(false);
    }
  };
  const openTerminal = (id: string) =>
    act(async () => {
      const attached = await run('sessions.attach', { id });
      return attached && `Opened ${attached.target} in ${attached.app}`;
    });
  const send = (id: string, form: HTMLFormElement) =>
    act(async () => {
      const prompt = String(new FormData(form).get('prompt') ?? '');
      const sent = await run('sessions.send', { id, prompt });
      if (!sent) return undefined;
      form.reset();
      return `Sent ${sent.chars} characters to ${id}`;
    });
  const stop = (id: string) =>
    act(async () => {
      const stopped = await run('sessions.stop', { id });
      await refresh();
      if (!stopped) return undefined;
      return stopped.outcome === 'already-ended'
        ? `Session ${id} had already ended`
        : `Stopped session ${id}`;
    });
  const resume = (id: string) =>
    act(async () => {
      const resumed = await run('sessions.resume', { id });
      await refresh();
      return resumed && `Resumed session ${id} as ${resumed.id}`;
    });

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
        Show older
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
            <th>Confidence</th>
            <th>Attention</th>
            <th>Running</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.map((s) =>
            s.managed ? (
              <tr key={s.id} data-testid="session-row" data-alive={s.alive}>
                <td>{s.id}</td>
                <td>{s.project}</td>
                <td>{s.agent}</td>
                <td>{s.lastState.state}</td>
                <td>{percent(s.lastState.confidence)}</td>
                <td>{s.attention.toFixed(2)}</td>
                <td>{running(s.runningSeconds)}</td>
                <td>
                  {s.alive ? (
                    <>
                      <form
                        data-testid="session-send"
                        onSubmit={(e) => {
                          e.preventDefault();
                          send(s.id, e.currentTarget);
                        }}
                      >
                        <input
                          name="prompt"
                          data-testid="session-prompt"
                          aria-label={`Prompt for ${s.id}`}
                        />
                        <button type="submit" data-testid="session-send-submit" disabled={acting}>
                          Send
                        </button>
                      </form>
                      <button
                        type="button"
                        data-testid="session-terminal"
                        onClick={() => openTerminal(s.id)}
                        disabled={acting}
                      >
                        Terminal
                      </button>
                      <button
                        type="button"
                        data-testid="session-stop"
                        onClick={() => stop(s.id)}
                        disabled={acting}
                      >
                        Stop
                      </button>
                    </>
                  ) : (
                    s.agentSessionId &&
                    !s.resumedBy && (
                      <button
                        type="button"
                        data-testid="session-resume"
                        onClick={() => resume(s.id)}
                        disabled={acting}
                      >
                        Resume
                      </button>
                    )
                  )}
                </td>
              </tr>
            ) : (
              // Started outside Mesa: shown so the board is complete, never acted on.
              <tr key={s.id} data-testid="session-row" data-alive data-managed="false">
                <td>{s.id}</td>
                <td>{s.project ?? '-'}</td>
                <td>{s.agent}</td>
                <td>{s.lastState.state}</td>
                <td>{percent(s.lastState.confidence)}</td>
                <td>{s.attention.toFixed(2)}</td>
                <td>{running(s.runningSeconds)}</td>
                <td title={s.cwd}>not managed by Mesa</td>
              </tr>
            ),
          )}
        </tbody>
      </table>
      <button type="button" data-testid="sessions-refresh" onClick={refresh} disabled={busy}>
        {busy ? 'Refreshing...' : 'Refresh'}
      </button>
    </section>
  );
}
