import type { Config, WorkspaceFile } from '@mesa/core';
import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { said, warningOf } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { CreateFileDialog } from './dialogs/CreateFileDialog';
import { DeleteFileDialog } from './dialogs/DeleteFileDialog';
import { DiscardFileDialog } from './dialogs/DiscardFileDialog';
import { RenameFileDialog } from './dialogs/RenameFileDialog';
import { FileEditor } from './FileEditor';
import { FileEditorSettings } from './FileEditorSettings';
import { FileSearch } from './FileSearch';
import { FilesEmptyState } from './FilesEmptyState';
import { FilesSidePanel } from './FilesSidePanel';
import { FileTabBar } from './FileTabBar';
import { FileTree } from './FileTree';
import { useFilePanes } from './useFilePanes';
import { useUnloadGuard } from './useUnloadGuard';

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

/**
 * A two-pane repository browser over the same checked file commands as the CLI. It owns
 * the open file and its unsaved draft: every navigation that would drop the draft asks first.
 */
export function FilesTab(props: {
  project: string;
  onDirtyChange: (dirty: boolean) => void;
  target?: { checkout: string; path: string; line: number };
}) {
  const [checkout, setCheckout] = useState('');
  const [opened, setOpened] = useState<(WorkspaceFile & { targetLine?: number }) | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [draft, setDraft] = useState('');
  const { pane, setPane, focusPane, goToInput, searchInput } = useFilePanes();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | 'discard'>();
  const [pending, setPending] = useState<Pending>();
  const loadRequest = useRef(0);
  const run = useRun();
  const config = useCommand('config.get');
  const preferences = config.data?.editor ?? DEFAULT_EDITOR;
  const treeFontSize =
    config.data?.appearance.fileTreeFontSize ?? DEFAULT_APPEARANCE.fileTreeFontSize;
  const { acting, act } = useAct();
  const tree = useCommand('files.tree', {
    project: props.project,
    checkout: checkout || undefined,
  });
  const dirty = Boolean(opened && draft !== opened.text);
  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useUnloadGuard(dirty);
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
      return warningOf(result);
    });
  const savePreference = (path: keyof Config['editor'], value: unknown) =>
    act(async () => {
      const result = await run('config.set', { path: `editor.${path}`, value });
      if (!result) return undefined;
      await config.refresh();
      return warningOf(result);
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
      return warningOf(result);
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
      return warningOf(result);
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
      return warningOf(result);
    });
  return (
    <section
      data-testid="files-workspace"
      aria-label="Files"
      className="flex h-[calc(100vh-13rem)] min-h-[30rem] overflow-hidden rounded-lg border bg-card/40"
    >
      <FilesSidePanel pane={pane} onPane={setPane}>
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
            fontSize={treeFontSize}
          />
        ) : (
          <FileSearch
            key={checkout}
            project={props.project}
            checkout={checkout || undefined}
            inputRef={searchInput}
            fontSize={treeFontSize}
            onOpen={(target) => request({ kind: 'open', ...target })}
          />
        )}
      </FilesSidePanel>
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
        <CreateFileDialog
          busy={acting}
          onCreate={(path) => void create(path)}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'rename' && opened && (
        <RenameFileDialog
          path={opened.path}
          busy={acting}
          onRename={(path) => void rename(path)}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'delete' && opened && (
        <DeleteFileDialog
          path={opened.path}
          busy={acting}
          onDelete={() => void remove()}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'discard' && (
        <DiscardFileDialog
          path={opened?.path}
          onCancel={() => {
            setDialog(undefined);
            setPending(undefined);
          }}
          onDiscard={() => {
            if (pending) void perform(pending);
          }}
        />
      )}
    </section>
  );
}
