import type { Check, DoctorReport } from '@mesa/core';
import { type CommandState, useCommand, useRun } from '../lib/useCommand';

const MARK: Record<Check['status'], string> = { ok: '✓', warn: '!', fail: '✗' };

/**
 * The doctor state is the App's, so the header's verdict and this screen show the same run. The
 * windows on Mesa's tmux server sit under the checks, and Recheck reruns both.
 */
export function DoctorScreen({ doctor }: { doctor: CommandState<DoctorReport> }) {
  const { data, busy, refresh } = doctor;
  const windows = useCommand('windows.list');
  const hooks = useCommand('hooks.status');
  const run = useRun();
  const change = async (name: 'hooks.install' | 'hooks.uninstall') => {
    // The doctor's own `claude hooks` row changes too.
    if (await run(name)) await Promise.all([hooks.refresh(), refresh()]);
  };
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
      <h3>Claude Code hooks</h3>
      {hooks.data && (
        <p data-testid="hooks-status">
          {hooks.data.installed
            ? 'Installed'
            : hooks.data.stale
              ? 'Stale (reinstall)'
              : 'Not installed'}{' '}
          in {hooks.data.path}{' '}
          <button
            type="button"
            data-testid={hooks.data.installed ? 'hooks-uninstall' : 'hooks-install'}
            onClick={() => change(hooks.data?.installed ? 'hooks.uninstall' : 'hooks.install')}
            disabled={hooks.busy}
          >
            {hooks.data.installed ? 'Uninstall' : 'Install'}
          </button>
        </p>
      )}
      <h3>tmux windows</h3>
      {windows.data?.length === 0 && (
        <p data-testid="tmux-none">No windows on Mesa's tmux server.</p>
      )}
      <ul>
        {windows.data?.map((w) => (
          <li key={`${w.project}:${w.window}`} data-testid="tmux-window">
            {w.project}:{w.window} {w.dead ? '(exited)' : w.command} {w.path}
          </li>
        ))}
      </ul>
      <button
        type="button"
        data-testid="doctor-recheck"
        onClick={() => Promise.all([refresh(), windows.refresh()])}
        disabled={busy || windows.busy}
      >
        {busy ? 'Checking...' : 'Recheck'}
      </button>
    </section>
  );
}
