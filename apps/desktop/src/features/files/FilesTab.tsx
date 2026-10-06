import type { Config } from '@mesa/core';
import { DEFAULT_APPEARANCE } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { warningOf } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCommand, useRun } from '@/lib/useCommand';
import { CreateFileDialog } from './dialogs/CreateFileDialog';
import { DeleteFileDialog } from './dialogs/DeleteFileDialog';
import { DiscardFileDialog } from './dialogs/DiscardFileDialog';
import { RenameFileDialog } from './dialogs/RenameFileDialog';
import { FileEditor } from './FileEditor';
import { FileEditorSettingsPanel } from './FileEditorSettingsPanel';
import { FileSearch } from './FileSearch';
import { FilesEmptyState } from './FilesEmptyState';
import { FilesSidePanel } from './FilesSidePanel';
import { FileTabBar } from './FileTabBar';
import { FileTree } from './FileTree';
import { useFilePanes } from './useFilePanes';
import { useOpenFile } from './useOpenFile';
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
 * A two-pane repository browser over the same checked file commands as the CLI. It guards the
 * open file's unsaved draft (useOpenFile): every navigation that would drop the draft asks first.
 */
export function FilesTab(props: {
  project: string;
  onDirtyChange: (dirty: boolean) => void;
  target?: { checkout: string; path: string; line: number };
}) {
  const [checkout, setCheckout] = useState('');
  const { pane, setPane, focusPane, goToInput, searchInput } = useFilePanes();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [dialog, setDialog] = useState<'create' | 'rename' | 'delete' | 'discard'>();
  const [pending, setPending] = useState<Pending>();
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
  const file = useOpenFile({
    project: props.project,
    checkout,
    refresh: tree.refresh,
    onWritten: () => setDialog(undefined),
  });
  const { opened, dirty } = file;
  useEffect(() => props.onDirtyChange(dirty), [dirty, props.onDirtyChange]);
  useUnloadGuard(dirty);
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
    if (next.kind === 'open') await file.load(next.path, next.line);
    if (next.kind === 'link') {
      setCheckout(next.checkout);
      await file.load(next.path, next.line, next.checkout);
    }
    if (next.kind === 'checkout') {
      file.close();
      setCheckout(next.path);
    }
    if (next.kind === 'close') file.close();
    if (next.kind === 'reload' && opened) await file.load(opened.path, opened.targetLine);
  };
  const linkRequest = useRef(request);
  useEffect(() => {
    linkRequest.current = request;
  });
  useEffect(() => {
    if (props.target) linkRequest.current({ kind: 'link', ...props.target });
  }, [props.target]);
  const savePreference = (path: keyof Config['editor'], value: unknown) =>
    act(async () => {
      const result = await run('config.set', { path: `editor.${path}`, value });
      if (!result) return undefined;
      await config.refresh();
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
              onOpenExternally={() => void act(file.openExternally)}
              onReload={() => request({ kind: 'reload' })}
              onRename={() => setDialog('rename')}
              onDelete={() => setDialog('delete')}
              onToggleSettings={() => setSettingsOpen((last) => !last)}
              onSave={() => void act(file.save)}
            />
            {settingsOpen && (
              <FileEditorSettingsPanel
                preferences={preferences}
                disabled={acting}
                onSave={(key, value) => void savePreference(key, value)}
              />
            )}
            <div className="flex min-h-0 flex-1 flex-col overflow-auto p-3">
              <FileEditor
                key={`${opened.path}:${file.openCount}:${preferences.fontSize}:${preferences.tabSize}:${preferences.wordWrap}:${preferences.vim}`}
                path={opened.path}
                value={file.draft}
                initialText={opened.text}
                onChange={file.setDraft}
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
          onCreate={(path) => void act(() => file.create(path))}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'rename' && opened && (
        <RenameFileDialog
          path={opened.path}
          busy={acting}
          onRename={(path) => void act(() => file.rename(path))}
          onCancel={() => setDialog(undefined)}
        />
      )}
      {dialog === 'delete' && opened && (
        <DeleteFileDialog
          path={opened.path}
          busy={acting}
          onDelete={() => void act(file.remove)}
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
