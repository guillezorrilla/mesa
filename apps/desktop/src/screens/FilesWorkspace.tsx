import type { Config, WorkspaceFile } from '@mesa/core';
import { PanelLeft, Search } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { FileEditor } from '@/components/FileEditor';
import { said } from '@/components/Toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { FileEditorSettings } from './FileEditorSettings';
import { FileSearch } from './FileSearch';
import { FilesEmptyState } from './FilesEmptyState';
import { FileTabBar } from './FileTabBar';
import { FileTree } from './FileTree';

type Pending =
  | { kind: 'open'; path: string; line?: number }
  | { kind: 'link'; checkout: string; path: string; line: number }
  | { kind: 'checkout'; path: string }
  | { kind: 'close' }
  | { kind: 'reload' };

const DEFAULT_EDITOR: Config['editor'] = {
  fontSize: 13,
  tabSize: 2,
  wordWrap: false,
  vim: false,
  external: [],
};
const PANES = [
  ['files', 'Files', PanelLeft],
  ['search', 'Search', Search],
] as const;

/**
 * the reference app-style two-pane repository browser over the same checked file commands as the CLI. It owns
 * the open file and its unsaved draft: every navigation that would drop the draft asks first.
 */
export function FilesWorkspace(props: {
  project: string;
  onDirtyChange: (dirty: boolean) => void;
  target?: { checkout: string; path: string; line: number };
}) {
  const [checkout, setCheckout] = useState('');
  const [opened, setOpened] = useState<(WorkspaceFile & { targetLine?: number }) | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [draft, setDraft] = useState('');
  const [pane, setPane] = useState<'files' | 'search'>('files');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const goToInput = useRef<HTMLInputElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | 'discard'>();
  const [pending, setPending] = useState<Pending>();
  const loadRequest = useRef(0);
  const run = useRun();
  const config = useCommand('config.get');
  const preferences = config.data?.editor ?? DEFAULT_EDITOR;
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
  /** Shows a pane and focuses its field, as Cmd+P and Cmd+Shift+F do. */
  const focusPane = (name: 'files' | 'search') => {
    setPane(name);
    requestAnimationFrame(() => (name === 'search' ? searchInput : goToInput).current?.focus());
  };
  const focusPaneRef = useRef(focusPane);
  focusPaneRef.current = focusPane;
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      if (event.key.toLowerCase() !== (event.shiftKey ? 'f' : 'p')) return;
      event.preventDefault();
      focusPaneRef.current(event.shiftKey ? 'search' : 'files');
    };
    window.addEventListener('keydown', shortcut);
    return () => window.removeEventListener('keydown', shortcut);
  }, []);
  const load = async (path: string, line?: number, selected = checkout) => {
    const request = ++loadRequest.current;
    const file = await run('files.read', {
      project: props.project,
      checkout: selected || undefined,
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
    if (next.kind === 'link') {
      loadRequest.current++;
      setCheckout(next.checkout);
      await load(next.path, next.line, next.checkout);
    }
    if (next.kind === 'checkout') {
      loadRequest.current++;
      setCheckout(next.path);
      setOpened(null);
    }
    if (next.kind === 'close') {
      loadRequest.current++;
      setOpened(null);
    }
    if (next.kind === 'reload' && opened) await load(opened.path, opened.targetLine);
  };
  const linkRequest = useRef(request);
  useEffect(() => {
    linkRequest.current = request;
  });
  useEffect(() => {
    if (props.target) linkRequest.current({ kind: 'link', ...props.target });
  }, [props.target]);
  const save = () =>
    act(async () => {
      if (!opened) return undefined;
      const request = loadRequest.current;
      const result = await run('files.write', {
        project: props.project,
        checkout: checkout || undefined,
        path: opened.path,
        text: draft,
        revision: opened.revision,
      });
      if (!result) return undefined;
      // Another file opened meanwhile: this one's header must not return over its text.
      if (request === loadRequest.current)
        setOpened({
          ...opened,
          text: draft,
          lines: draft.split('\n').length,
          revision: result.revision ?? opened.revision,
        });
      await tree.refresh();
      return said(`Saved ${opened.path}`, result);
    });
  const savePreference = (path: keyof Config['editor'], value: unknown) =>
    act(async () => {
      const result = await run('config.set', { path: `editor.${path}`, value });
      if (!result) return undefined;
      await config.refresh();
      return said(`Saved editor ${path}`, result);
    });
  const openExternally = () =>
    act(async () => {
      if (!opened) return undefined;
      const result = await run('files.open', {
        project: props.project,
        checkout: checkout || undefined,
        path: opened.path,
        line: opened.targetLine,
      });
      return result && said(`Opened ${opened.path} externally`, result);
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
  return (
    <section
      data-testid="files-workspace"
      aria-label="Files"
      className="flex h-[calc(100vh-13rem)] min-h-[30rem] overflow-hidden rounded-lg border bg-card/40"
    >
      <aside className="flex w-80 shrink-0 flex-col border-r bg-card">
        <div className="flex shrink-0 border-b" role="tablist">
          {PANES.map(([name, label, Icon]) => (
            <button
              key={name}
              type="button"
              role="tab"
              aria-selected={pane === name}
              className="-mb-px flex items-center gap-1.5 border-b-2 border-transparent px-4 py-2 text-sm text-muted-foreground hover:text-foreground aria-selected:border-state-working aria-selected:text-foreground"
              onClick={() => setPane(name)}
            >
              <Icon aria-hidden className="size-4" />
              {label}
            </button>
          ))}
        </div>
        {pane === 'files' ? (
          <FileTree
            key={checkout}
            project={props.project}
            checkout={checkout}
            onCheckout={(path) => request({ kind: 'checkout', path })}
            tree={tree.data}
            busy={tree.busy}
            openedPath={opened?.path}
            createDisabled={dirty || acting}
            onCreate={() => setDialog('create')}
            onRefresh={() => void tree.refresh()}
            onOpen={(target) => request({ kind: 'open', ...target })}
            goToRef={goToInput}
          />
        ) : (
          <FileSearch
            key={checkout}
            project={props.project}
            checkout={checkout || undefined}
            inputRef={searchInput}
            onOpen={(target) => request({ kind: 'open', ...target })}
          />
        )}
      </aside>
      <div className="flex min-w-0 flex-1 flex-col bg-background/40">
        {opened ? (
          <>
            <FileTabBar
              file={opened}
              dirty={dirty}
              acting={acting}
              canOpenExternally={preferences.external.length > 0}
              settingsOpen={settingsOpen}
              onClose={() => request({ kind: 'close' })}
              onOpenExternally={() => void openExternally()}
              onReload={() => request({ kind: 'reload' })}
              onRename={() => setDialog('rename')}
              onDelete={() => setDialog('delete')}
              onToggleSettings={() => setSettingsOpen((last) => !last)}
              onSave={() => void save()}
            />
            {settingsOpen && (
              <FileEditorSettings
                preferences={preferences}
                disabled={acting}
                onSave={(key, value) => void savePreference(key, value)}
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
              <FileEditor
                key={`${opened.path}:${openCount}:${preferences.fontSize}:${preferences.tabSize}:${preferences.wordWrap}:${preferences.vim}`}
                path={opened.path}
                value={draft}
                initialText={opened.text}
                onChange={setDraft}
                targetLine={opened.targetLine}
                preferences={preferences}
              />
            </div>
          </>
        ) : (
          <FilesEmptyState onGoTo={() => focusPane('files')} onSearch={() => focusPane('search')} />
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
