import type { Agent, SessionRow } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Terminal } from '../components/Terminal';
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
/** Who placed the row: Faro's backend, and the adapter's list price when it answered. */
const decidedBy = (d: { backend: string; costUsd?: number }) =>
  `decided by ${d.backend}${d.costUsd === undefined ? '' : ` (list price $${d.costUsd.toFixed(4)})`}`;

type ListName = 'sessions.list' | 'sessions.all';

/** The board looks again this often, and at once after every action. */
const REFRESH_MS = 2000;
// ponytail: core's FINAL_STATES, copied like `running` above; change both together.
const FINISHED = new Set(['done', 'failed']);
/** Its agent has exited: stopped, its window gone, or its pane dead (done or failed). */
const exited = (s: SessionRow) => !s.alive || FINISHED.has(s.lastState.state);
/** A row whose clock still runs. */
const ticking = (s: SessionRow) => !exited(s) && !('endedAt' in s && s.endedAt);
/** A Mesa session whose agent has exited and whose conversation can reopen. */
const resumable = (s: SessionRow) =>
  s.managed && exited(s) && Boolean(s.agentSessionId) && !s.resumedBy;

/**
 * The Session Board: every session, Mesa's and (muted, read-only) those it did not start,
 * highest attention first, with Faro's state, confidence, and attention, the running time, and
 * the last output line. It looks again every two seconds and after every action.
 */
export function BoardScreen() {
  const [ended, setEnded] = useState(false);
  const run = useRun();
  const list = run as (name: ListName) => Promise<SessionRow[] | undefined>;
  const toast = useToast();
  const [data, setData] = useState<SessionRow[]>();
  const [acting, setActing] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  // Embedded terminals, one panel per session, in the order opened; several at once.
  const [panels, setPanels] = useState<string[]>([]);
  const embed = (id: string) => setPanels((open) => (open.includes(id) ? open : [...open, id]));
  // A panel goes with its session: once it is not live (stopped, resumed, exited), tmux would
  // show the view another window of the project.
  const live = new Set((data ?? []).filter((s) => s.managed && !exited(s)).map((s) => s.id));
  if (data && panels.some((id) => !live.has(id))) setPanels(panels.filter((id) => live.has(id)));
  const unembed = (id: string) => setPanels((open) => open.filter((p) => p !== id));
  // The running time ticks every second between looks: seconds since the rows arrived.
  const [since, setSince] = useState(() => Date.now());
  const [now, setNow] = useState(() => Date.now());
  const wanted = useRef<ListName>('sessions.list');
  wanted.current = ended ? 'sessions.all' : 'sessions.list';
  const looking = useRef(false);
  const again = useRef(false);
  /**
   * One look at a time: a look asked for while one runs (an action, a tick) happens right after
   * it, for whichever list is wanted then, so a slow board never piles up calls and a late reply
   * for the other list never lands.
   */
  const look = useCallback(async () => {
    if (looking.current) {
      again.current = true;
      return;
    }
    looking.current = true;
    try {
      do {
        again.current = false;
        const name = wanted.current;
        const rows = await list(name);
        if (rows && wanted.current === name) {
          setData([...rows].sort((a, b) => b.attention - a.attention));
          setSince(Date.now());
        }
      } while (again.current);
    } finally {
      looking.current = false;
    }
  }, [list]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new list is wanted when `ended` flips.
  useEffect(() => {
    look();
  }, [look, ended]);
  useEffect(() => {
    const lookAgain = setInterval(look, REFRESH_MS);
    const tick = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      clearInterval(lookAgain);
      clearInterval(tick);
    };
  }, [look]);
  const elapsed = Math.max(0, Math.floor((now - since) / 1000));

  // One action at a time, so a double click opens one terminal or one session, not two.
  const act = async (action: () => Promise<string | undefined>) => {
    setActing(true);
    try {
      const said = await action();
      if (said) toast(said);
    } finally {
      setActing(false);
      await look();
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
      if (!stopped) return undefined;
      return stopped.outcome === 'already-ended'
        ? `Session ${id} had already ended`
        : `Stopped session ${id}`;
    });
  const resume = (id: string) =>
    act(async () => {
      const resumed = await run('sessions.resume', { id });
      return resumed && `Resumed session ${id} as ${resumed.id}`;
    });
  const open = (project: string, agent: Agent, goal: string) =>
    act(async () => {
      const opened = await run('sessions.open', { project, agent, goal });
      if (!opened) return undefined;
      setNewOpen(false);
      return `Opened session ${opened.id} on ${opened.project}`;
    });

  return (
    <section data-testid="session-board">
      <h2>Board</h2>
      <button type="button" data-testid="new-session" onClick={() => setNewOpen(true)}>
        New session
      </button>{' '}
      <label>
        <input
          type="checkbox"
          data-testid="sessions-ended"
          checked={ended}
          onChange={(e) => setEnded(e.target.checked)}
        />{' '}
        Show older
      </label>
      {newOpen && <NewSession onOpen={open} onCancel={() => setNewOpen(false)} disabled={acting} />}
      {data?.length === 0 && (
        <p data-testid="sessions-empty">No sessions yet: start one with New session.</p>
      )}
      <table>
        <thead>
          <tr>
            <th>Id</th>
            <th>Project</th>
            <th>Agent</th>
            <th>State</th>
            <th>Attention</th>
            <th>Running</th>
            <th>Last output</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {data?.map((s) => (
            <tr
              key={s.id}
              data-testid="session-row"
              data-alive={s.alive}
              data-managed={s.managed}
              className={s.managed ? undefined : 'muted'}
            >
              <td>
                {s.managed && !exited(s) ? (
                  <button
                    type="button"
                    className="link"
                    data-testid="embed-terminal"
                    title="Open its terminal here"
                    onClick={() => embed(s.id)}
                  >
                    {s.id}
                  </button>
                ) : (
                  s.id
                )}
              </td>
              <td>
                {s.project ?? '-'}
                {s.managed && s.goal && (
                  <div className="goal" data-testid="session-goal" title={s.goal}>
                    {s.goal.split('\n', 1)[0]}
                  </div>
                )}
              </td>
              <td>{s.agent}</td>
              <td>
                <span
                  className={`badge state-${s.lastState.state}`}
                  data-testid="session-state"
                  title={decidedBy(s.decision)}
                >
                  {s.lastState.state} {percent(s.lastState.confidence)}
                </span>
              </td>
              <td data-testid="session-attention">{s.attention.toFixed(2)}</td>
              <td data-testid="session-running">
                {running(s.runningSeconds + (ticking(s) ? elapsed : 0))}
              </td>
              <td className="last-output">{s.managed ? (s.lastOutput ?? '') : ''}</td>
              <td>
                {s.managed ? (
                  <>
                    <form
                      data-testid="session-send"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!acting) send(s.id, e.currentTarget);
                      }}
                    >
                      <input
                        name="prompt"
                        data-testid="session-prompt"
                        aria-label={`Prompt for ${s.id}`}
                        disabled={exited(s)}
                      />
                      <button
                        type="submit"
                        data-testid="session-send-submit"
                        disabled={exited(s) || acting}
                      >
                        Send
                      </button>
                    </form>
                    <button
                      type="button"
                      data-testid="open-terminal"
                      onClick={() => openTerminal(s.id)}
                      disabled={!s.alive || acting}
                    >
                      Open terminal
                    </button>
                    <button
                      type="button"
                      data-testid="session-stop"
                      onClick={() => stop(s.id)}
                      disabled={!s.alive || acting}
                    >
                      Stop
                    </button>
                    <button
                      type="button"
                      data-testid="session-resume"
                      onClick={() => resume(s.id)}
                      disabled={!resumable(s) || acting}
                    >
                      Resume
                    </button>
                  </>
                ) : (
                  // Started outside Mesa: shown so the board is complete, never acted on.
                  <span className="tag" title={s.cwd}>
                    not managed
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {panels.map((id) => (
        <section key={id} className="terminal-panel" data-testid="terminal-panel">
          <header>
            <strong>{id}</strong>{' '}
            <button
              type="button"
              data-testid="open-external-terminal"
              onClick={() => openTerminal(id)}
              disabled={acting}
            >
              Open in terminal app
            </button>{' '}
            <button type="button" data-testid="close-terminal" onClick={() => unembed(id)}>
              Close
            </button>
          </header>
          <Terminal sessionId={id} />
        </section>
      ))}
    </section>
  );
}

/**
 * The New session dialog, modal: a registered project, an agent (v1 runs Claude Code only), and
 * an optional goal, the agent's first prompt.
 */
function NewSession(props: {
  onOpen: (project: string, agent: Agent, goal: string) => void;
  onCancel: () => void;
  disabled: boolean;
}) {
  const projects = useCommand('projects.list');
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    // ponytail: jsdom has no showModal; the open attribute shows the same dialog there.
    if (dialog?.showModal) dialog.showModal();
    else dialog?.setAttribute('open', '');
  }, []);
  return (
    <dialog
      ref={ref}
      data-testid="new-session-dialog"
      aria-labelledby="new-session-title"
      onCancel={props.onCancel}
    >
      <h3 id="new-session-title">New session</h3>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          // The textarea's own value: form data may turn its newlines into CRLF.
          const goal = e.currentTarget.elements.namedItem('goal') as HTMLTextAreaElement;
          props.onOpen(String(form.get('project') ?? ''), 'claude', goal.value);
        }}
      >
        <label>
          Project{' '}
          <select name="project" data-testid="new-session-project" required>
            {projects.data?.map((p) => (
              <option key={p.name} value={p.name} disabled={!p.exists}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <fieldset>
          <legend>Agent</legend>
          <label>
            <input type="radio" name="agent" value="claude" defaultChecked /> Claude Code
          </label>
          <label title="Codex support is planned in #43">
            <input type="radio" name="agent" value="codex" disabled /> Codex (planned)
          </label>
        </fieldset>
        <label>
          Goal (optional){' '}
          <textarea
            name="goal"
            data-testid="new-session-goal"
            rows={4}
            placeholder="The first prompt; /goal keeps the agent working until its condition holds"
          />
        </label>
        <button type="submit" data-testid="new-session-submit" disabled={props.disabled}>
          Open
        </button>{' '}
        <button type="button" onClick={props.onCancel}>
          Cancel
        </button>
      </form>
    </dialog>
  );
}
