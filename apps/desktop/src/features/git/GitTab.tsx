import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import {
  ArrowUpDown,
  Columns2,
  FileText,
  GitBranch,
  GitFork,
  RefreshCw,
  Rows2,
  Search,
} from 'lucide-react';
import { useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { said } from '@/components/Toast';
import { CheckoutPicker } from '@/features/worktrees/CheckoutPicker';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { GitDiffHeader } from './diff/GitDiffHeader';
import { GitDiffView } from './diff/GitDiffView';
import { GitBranches } from './GitBranches';
import { GitChangeList } from './GitChangeList';
import { GitCommitBox } from './GitCommitBox';
import { GitHistory } from './GitHistory';
import { GitStashes } from './GitStashes';
import { GitSyncPanel } from './GitSyncPanel';
import { type GitSelection, gitSections, isSelected, listOrder } from './gitChanges';

const VIEWS = [
  ['status', 'Status', FileText],
  ['graph', 'Graph', GitFork],
] as const;

/** Git changes for the registered checkout and session worktrees, as the project's Git tab. */
export function GitTab(props: {
  project: string;
  /** After this tab stages, unstages, commits or refreshes. */
  onChanged?: () => void;
}) {
  const [checkout, setCheckout] = useState('');
  const [view, setView] = useState<'status' | 'graph'>('status');
  const [selected, setSelected] = useState<GitSelection>();
  const [layout, setLayout] = useState<'inline' | 'side-by-side'>('side-by-side');
  const [panel, setPanel] = useState<'stashes' | 'remote'>();
  const [filter, setFilter] = useState('');
  const [revision, setRevision] = useState(0);
  const run = useRun();
  const { acting, act } = useAct();
  const target = { project: props.project, checkout: checkout || undefined };
  const status = useCommand('git.status', target);
  const appearance = useCommand('config.get').data?.appearance ?? DEFAULT_APPEARANCE;
  const changed = async () => {
    await status.refresh();
    setRevision((last) => last + 1);
    props.onChanged?.();
  };
  const changeIndex = (action: 'stage' | 'unstage', paths: string[]) =>
    act(async () => {
      let result: Awaited<ReturnType<typeof run<'git.stage'>>>;
      // ponytail: one call per path; core takes only literal file paths, never the whole tree.
      for (const path of paths) {
        result = await run(action === 'stage' ? 'git.stage' : 'git.unstage', { ...target, path });
        if (!result) break;
      }
      await changed();
      if (!result) return undefined;
      const what = paths.length === 1 ? paths[0] : `${paths.length} files`;
      return said(`${action === 'stage' ? 'Staged' : 'Unstaged'} ${what}`, result);
    });
  const commit = async (message: string) => {
    let done = false;
    await act(async () => {
      const result = await run('git.commit', { ...target, message });
      if (!result) return undefined;
      done = true;
      await changed();
      return said(`Committed ${result.oid.slice(0, 7)}`, result);
    });
    return done;
  };
  const changes = status.data?.changes ?? [];
  const sections = gitSections(changes, filter);
  const order = listOrder(sections);
  const at = Math.max(
    0,
    order.findIndex((entry) => isSelected(entry, selected)),
  );
  const current = order[at];
  const select = (index: number) => {
    const entry = order[index];
    if (entry) setSelected({ path: entry.change.path, staged: entry.staged });
  };
  const togglePanel = (name: 'stashes' | 'remote') => setPanel(panel === name ? undefined : name);
  const switcher = (
    <div className="flex items-center gap-1 rounded-lg bg-background p-0.5">
      {VIEWS.map(([name, label, Icon]) => (
        <button
          key={name}
          type="button"
          aria-pressed={view === name}
          className="flex items-center gap-1.5 rounded-md px-3 py-1.5 text-sm text-muted-foreground hover:text-foreground aria-pressed:bg-card aria-pressed:text-foreground"
          onClick={() => setView(name)}
        >
          <Icon aria-hidden className="size-4" />
          {label}
          {name === 'status' && changes.length > 0 && <CountPill count={changes.length} />}
        </button>
      ))}
    </div>
  );
  const tools = (
    <>
      <CheckoutPicker
        project={props.project}
        label="Checkout"
        value={checkout}
        onChange={(path) => {
          setCheckout(path);
          setSelected(undefined);
        }}
      />
      <IconButton
        label={layout === 'inline' ? 'Side-by-side diff' : 'Inline diff'}
        icon={layout === 'inline' ? Columns2 : Rows2}
        onClick={() => setLayout(layout === 'inline' ? 'side-by-side' : 'inline')}
      />
    </>
  );
  return (
    <section
      className="flex h-[calc(100vh-13rem)] min-h-[30rem] flex-col overflow-hidden rounded-lg border bg-card/40"
      aria-label="Git status"
    >
      {view === 'graph' ? (
        <GitHistory
          key={`graph:${checkout}:${revision}`}
          {...target}
          switcher={switcher}
          tools={tools}
          layout={layout}
          diffFontSize={appearance.diffFontSize}
        />
      ) : (
        <>
          <div className="flex shrink-0 items-center gap-3 border-b px-3 py-2">
            {switcher}
            {status.data && (
              <span
                className="flex min-w-0 items-center gap-1.5 truncate font-mono text-sm text-state-working"
                title={status.data.checkout.path}
              >
                <GitBranch aria-hidden className="size-4 shrink-0" />
                {status.data.branch ?? 'Detached HEAD'}
              </span>
            )}
            <span className="ml-auto flex items-center gap-1">
              {tools}
              <IconButton
                label="Remote"
                icon={ArrowUpDown}
                active={panel === 'remote'}
                onClick={() => togglePanel('remote')}
              />
              <IconButton
                label="Refresh"
                icon={RefreshCw}
                disabled={status.busy}
                onClick={() => void changed()}
              />
            </span>
          </div>
          <div className="flex min-h-0 flex-1">
            <aside className="flex w-72 shrink-0 flex-col border-r bg-card">
              <div className="border-b p-2">
                <label className="flex items-center gap-2 rounded-lg bg-background px-2.5 py-1.5">
                  <Search aria-hidden className="size-4 text-muted-foreground" />
                  <input
                    aria-label="Filter files"
                    className="min-w-0 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
                    placeholder="Filter files..."
                    value={filter}
                    onChange={(event) => setFilter(event.target.value)}
                  />
                </label>
              </div>
              <section className="min-h-0 flex-1 overflow-y-auto" aria-label="Changed files">
                {!status.data && status.busy && (
                  <Muted className="p-4">Loading Git status...</Muted>
                )}
                <GitChangeList
                  sections={sections}
                  fontSize={appearance.fileTreeFontSize}
                  selected={current && { path: current.change.path, staged: current.staged }}
                  acting={acting}
                  onSelect={(entry) =>
                    setSelected({ path: entry.change.path, staged: entry.staged })
                  }
                  onIndex={(action, paths) => void changeIndex(action, paths)}
                />
                {status.data && !changes.length && (
                  <Muted className="p-4">Working tree clean.</Muted>
                )}
              </section>
              <GitCommitBox
                canCommit={sections.some((section) => section.title === 'Staged')}
                acting={acting}
                stashesOpen={panel === 'stashes'}
                onToggleStashes={() => togglePanel('stashes')}
                onCommit={commit}
              />
            </aside>
            <section className="flex min-w-0 flex-1 flex-col" aria-label="Git diff">
              {panel && (
                <div className="shrink-0 border-b p-3">
                  {panel === 'stashes' ? (
                    <GitStashes
                      key={`stashes:${checkout}`}
                      {...target}
                      onChanged={() => void changed()}
                    />
                  ) : (
                    <GitSyncPanel
                      key={`sync:${checkout}:${revision}`}
                      {...target}
                      onChanged={() => void changed()}
                    />
                  )}
                </div>
              )}
              {current ? (
                <>
                  <GitDiffHeader
                    entry={current}
                    at={at}
                    total={order.length}
                    onMove={(step) => select(at + step)}
                  />
                  <div className="min-h-0 flex-1 overflow-auto p-3">
                    <GitDiffView
                      key={`${checkout}:${current.change.path}:${current.staged}:${layout}:${revision}`}
                      {...target}
                      path={current.change.path}
                      staged={current.staged}
                      untracked={current.code === '?'}
                      layout={layout}
                      fontSize={appearance.diffFontSize}
                    />
                  </div>
                </>
              ) : (
                status.data && (
                  <div className="grid flex-1 place-items-center text-sm text-muted-foreground">
                    {changes.length ? 'No changes match the filter.' : 'Nothing to commit.'}
                  </div>
                )
              )}
            </section>
          </div>
          <GitBranches key={`branches:${checkout}`} {...target} onChanged={() => void changed()} />
        </>
      )}
    </section>
  );
}
