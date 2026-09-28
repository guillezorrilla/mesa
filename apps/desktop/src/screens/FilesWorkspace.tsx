import type { FileHit, TreeRow, WorkspaceFile } from '@mesa/core';
import { File, Folder, FolderOpen, RefreshCw, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { FileEditor } from '@/components/FileEditor';
import { said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';

type Pending =
  | { kind: 'open'; path: string; line?: number }
  | { kind: 'checkout'; path: string }
  | { kind: 'close' }
  | { kind: 'reload' };

/** Xirp-style two-pane repository browser over the same checked file commands as the CLI. */
export function FilesWorkspace(props: {
  project: string;
  sessions: readonly TreeRow[];
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [checkout, setCheckout] = useState('');
  const [opened, setOpened] = useState<(WorkspaceFile & { targetLine?: number }) | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [query, setQuery] = useState('');
  const [goTo, setGoTo] = useState('');
  const [mode, setMode] = useState<'name' | 'content'>('name');
  const [hits, setHits] = useState<FileHit[] | null>(null);
  const [searchTruncated, setSearchTruncated] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | 'discard'>();
  const [pending, setPending] = useState<Pending>();
  const loadRequest = useRef(0);
  const run = useRun();
  const { acting, act } = useAct();
  const tree = useCommand('files.tree', {
    project: props.project,
    checkout: checkout || undefined,
  });
  const dirty = Boolean(opened && draft !== opened.text);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useEffect(() => {
    if (!dirty) return;
    const preventClose = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', preventClose);
    return () => window.removeEventListener('beforeunload', preventClose);
  }, [dirty]);
  const paths = [
    ...new Set(
      props.sessions.flatMap((row) =>
        row.managed && row.project === props.project && row.worktree ? [row.worktree.path] : [],
      ),
    ),
  ];
  const load = async (path: string, line?: number) => {
    const request = ++loadRequest.current;
    const file = await run('files.read', {
      project: props.project,
      checkout: checkout || undefined,
      path,
      line,
    });
    if (!file || request !== loadRequest.current) return;
    setOpenCount((count) => count + 1);
    setOpened(file);
    setDraft(file.text);
  };
  const request = (next: Pending) => {
    if (dirty) {
      setPending(next);
      setDialog('discard');
      return;
    }
    void perform(next);
  };
  const perform = async (next: Pending) => {
    setDialog(undefined);
    setPending(undefined);
    if (next.kind === 'open') await load(next.path, next.line);
    if (next.kind === 'checkout') {
      loadRequest.current++;
      setCheckout(next.path);
      setOpened(null);
      setHits(null);
    }
    if (next.kind === 'close') {
      loadRequest.current++;
      setOpened(null);
    }
    if (next.kind === 'reload' && opened) await load(opened.path, opened.targetLine);
  };
  const save = () =>
    act(async () => {
      if (!opened) return undefined;
      const result = await run('files.write', {
        project: props.project,
        checkout: checkout || undefined,
        path: opened.path,
        text: draft,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setOpened({
        ...opened,
        text: draft,
        lines: draft.split('\n').length,
        revision: result.revision ?? opened.revision,
      });
      await tree.refresh();
      return said(`Saved ${opened.path}`, result);
    });
  const search = () =>
    act(async () => {
      const result = await run('files.search', {
        project: props.project,
        checkout: checkout || undefined,
        query,
        content: mode === 'content',
      });
      if (!result) return undefined;
      setHits(result.hits);
      setSearchTruncated(result.truncated);
    });
  const create = (path: string) =>
    act(async () => {
      const result = await run('files.create', {
        project: props.project,
        checkout: checkout || undefined,
        path,
      });
      if (!result) return undefined;
      setDialog(undefined);
      await tree.refresh();
      await load(path);
      return said(`Created ${path}`, result);
    });
  const rename = (path: string) =>
    act(async () => {
      if (!opened) return undefined;
      const result = await run('files.rename', {
        project: props.project,
        checkout: checkout || undefined,
        from: opened.path,
        path,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setDialog(undefined);
      await tree.refresh();
      await load(path);
      return said(`Renamed to ${path}`, result);
    });
  const remove = () =>
    act(async () => {
      if (!opened) return undefined;
      const result = await run('files.delete', {
        project: props.project,
        checkout: checkout || undefined,
        path: opened.path,
        revision: opened.revision,
      });
      if (!result) return undefined;
      setDialog(undefined);
      setOpened(null);
      await tree.refresh();
      return said(`Deleted ${result.path}`, result);
    });
  const visible =
    tree.data?.entries.filter(
      (entry) =>
        !entry.path
          .split('/')
          .slice(0, -1)
          .some((_, i, parts) => collapsed.has(parts.slice(0, i + 1).join('/'))),
    ) ?? [];
  const jump = () => {
    const target = goTo.trim();
    const match = /^(.*):(\d+)$/.exec(target);
    if (target)
      request({
        kind: 'open',
        path: match?.[1] ?? target,
        line: match ? Number(match[2]) : undefined,
      });
  };
  const keyboard = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    const buttons = [
      ...(event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
        'button[data-file-row]',
      ) ?? []),
    ];
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0) return;
    const next =
      event.key === 'ArrowDown'
        ? at + 1
        : event.key === 'ArrowUp'
          ? at - 1
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? buttons.length - 1
              : -1;
    if (next >= 0) {
      event.preventDefault();
      buttons[Math.min(next, buttons.length - 1)]?.focus();
    }
  };
  return (
    <section
      data-testid="files-workspace"
      aria-label="Files"
      className="grid min-h-[34rem] gap-4 md:grid-cols-[minmax(15rem,20rem)_minmax(0,1fr)]"
    >
      <div className="min-w-0 rounded-lg border bg-card/40 p-3">
        <div className="flex items-center gap-2 border-b pb-3">
          <h3 className="flex-1 text-xs font-semibold uppercase tracking-wider">Files</h3>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Create file"
            disabled={dirty || acting}
            onClick={() => setDialog('create')}
          >
            +
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Refresh files"
            onClick={() => void tree.refresh()}
          >
            <RefreshCw aria-hidden />
          </Button>
        </div>
        <NativeSelect
          aria-label="Files checkout"
          className="mt-3"
          value={checkout}
          onChange={(event) => request({ kind: 'checkout', path: event.target.value })}
        >
          <NativeSelectOption value="">Main checkout</NativeSelectOption>
          {paths.map((path) => (
            <NativeSelectOption key={path} value={path}>
              {path}
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <form
          className="mt-3 flex gap-1"
          onSubmit={(event) => {
            event.preventDefault();
            void search();
          }}
        >
          <Input
            aria-label="Search files"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search files..."
          />
          <Button
            type="submit"
            variant="outline"
            size="icon-sm"
            aria-label="Run file search"
            disabled={!query.trim() || acting}
          >
            <Search aria-hidden />
          </Button>
        </form>
        <NativeSelect
          aria-label="File search mode"
          className="mt-2"
          value={mode}
          onChange={(event) => setMode(event.target.value as 'name' | 'content')}
        >
          <NativeSelectOption value="name">Filenames</NativeSelectOption>
          <NativeSelectOption value="content">Contents</NativeSelectOption>
        </NativeSelect>
        {hits ? (
          <section className="mt-3 space-y-1" aria-label="File search results">
            <Button type="button" variant="ghost" size="sm" onClick={() => setHits(null)}>
              Back to files
            </Button>
            {hits.map((hit) => (
              <button
                key={`${hit.path}:${hit.line}`}
                data-file-row
                type="button"
                onKeyDown={keyboard}
                className="block w-full rounded px-2 py-1 text-left text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                onClick={() => request({ kind: 'open', path: hit.path, line: hit.line })}
              >
                <span className="font-mono">
                  {hit.path}:{hit.line}
                </span>
                <span className="block truncate text-muted-foreground">{hit.preview}</span>
              </button>
            ))}
            {!hits.length && <p className="text-xs text-muted-foreground">No matches.</p>}
            {searchTruncated && (
              <p className="text-xs text-muted-foreground">
                Showing the first 100 matches or 1,500 entries.
              </p>
            )}
          </section>
        ) : (
          <section className="mt-3 max-h-[36rem] overflow-auto" aria-label="File tree">
            {visible.map((entry) => (
              <button
                key={entry.path}
                data-file-row
                type="button"
                onKeyDown={keyboard}
                className="flex w-full items-center gap-2 rounded py-1 pr-2 text-left font-mono text-xs hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                style={{ paddingLeft: `${entry.depth * 12 + 8}px` }}
                onClick={() =>
                  entry.kind === 'directory'
                    ? setCollapsed((last) => {
                        const next = new Set(last);
                        if (next.has(entry.path)) next.delete(entry.path);
                        else next.add(entry.path);
                        return next;
                      })
                    : request({ kind: 'open', path: entry.path })
                }
              >
                {entry.kind === 'file' ? (
                  <File aria-hidden className="size-3.5 shrink-0" />
                ) : collapsed.has(entry.path) ? (
                  <Folder aria-hidden className="size-3.5 shrink-0" />
                ) : (
                  <FolderOpen aria-hidden className="size-3.5 shrink-0" />
                )}
                <span className="truncate">{entry.path.split('/').at(-1)}</span>
              </button>
            ))}
            {tree.data?.truncated && (
              <p className="p-2 text-xs text-muted-foreground">Tree limited to 1,500 entries.</p>
            )}
            {!visible.length && !tree.busy && (
              <p className="p-2 text-xs text-muted-foreground">No files found.</p>
            )}
          </section>
        )}
      </div>
      <div className="min-w-0 rounded-lg border bg-card/40 p-4">
        <form
          className="mb-4 flex gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            jump();
          }}
        >
          <Input
            aria-label="Go to file and line"
            value={goTo}
            onChange={(event) => setGoTo(event.target.value)}
            placeholder="path/to/file.ts:42"
          />
          <Button type="submit" variant="outline" disabled={!goTo.trim()}>
            Go to file
          </Button>
        </form>
        {opened ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2 border-b pb-3">
              <h3 className="min-w-0 flex-1 truncate font-mono text-sm" title={opened.path}>
                {opened.path}
                {dirty ? ' *' : ''}
              </h3>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => request({ kind: 'reload' })}
              >
                Reload
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialog('rename')}
                disabled={dirty}
              >
                Rename
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setDialog('delete')}
                disabled={dirty}
              >
                Delete
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => request({ kind: 'close' })}
              >
                Close
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => void save()}
                disabled={!dirty || acting}
              >
                Save
              </Button>
            </div>
            <FileEditor
              key={`${opened.path}:${openCount}`}
              path={opened.path}
              value={draft}
              initialText={opened.text}
              onChange={setDraft}
              targetLine={opened.targetLine}
            />
            <p className="font-mono text-xs text-muted-foreground">
              {opened.lines} lines · revision {opened.revision.slice(0, 12)}
            </p>
          </div>
        ) : (
          <div className="grid min-h-80 place-items-center text-sm text-muted-foreground">
            Select a file to edit or preview.
          </div>
        )}
      </div>
      {dialog === 'create' && (
        <ActionDialog
          testId="file-create-dialog"
          title="Create file"
          description="Create one file in an existing folder of this checkout."
          submit={{ label: 'Create', testId: 'confirm-file-create', disabled: acting }}
          onCancel={() => setDialog(undefined)}
          onSubmit={(form) => void create(String(new FormData(form).get('path') ?? ''))}
        >
          <Label htmlFor="new-file-path">Repository-relative path</Label>
          <Input id="new-file-path" name="path" required placeholder="docs/notes.md" />
        </ActionDialog>
      )}
      {dialog === 'rename' && opened && (
        <ActionDialog
          testId="file-rename-dialog"
          title="Rename file"
          description={`Rename ${opened.path} without replacing another file.`}
          submit={{ label: 'Rename', testId: 'confirm-file-rename', disabled: acting }}
          onCancel={() => setDialog(undefined)}
          onSubmit={(form) => void rename(String(new FormData(form).get('path') ?? ''))}
        >
          <Label htmlFor="rename-file-path">New repository-relative path</Label>
          <Input id="rename-file-path" name="path" defaultValue={opened.path} required />
        </ActionDialog>
      )}
      {dialog === 'delete' && opened && (
        <ActionDialog
          testId="file-delete-dialog"
          title="Delete file?"
          description={`Delete ${opened.path} from this checkout. This cannot be undone in Mesa.`}
          submit={{
            label: 'Delete',
            testId: 'confirm-file-delete',
            disabled: acting,
            variant: 'destructive',
          }}
          onCancel={() => setDialog(undefined)}
          onSubmit={() => void remove()}
        >
          <p className="font-mono text-sm">{opened.path}</p>
        </ActionDialog>
      )}
      {dialog === 'discard' && (
        <ActionDialog
          testId="file-discard-dialog"
          title="Discard unsaved changes?"
          description="Your edits to this file have not been saved."
          submit={{
            label: 'Discard changes',
            testId: 'confirm-file-discard',
            disabled: false,
            variant: 'destructive',
          }}
          onCancel={() => {
            setDialog(undefined);
            setPending(undefined);
          }}
          onSubmit={() => {
            if (pending) void perform(pending);
          }}
        >
          <p className="font-mono text-sm">{opened?.path}</p>
        </ActionDialog>
      )}
    </section>
  );
}
