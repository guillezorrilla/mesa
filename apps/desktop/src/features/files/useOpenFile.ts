import type { WorkspaceFile } from '@mesa/core';
import { useRef, useState } from 'react';
import { type Message, said, warningOf } from '@/components/Toast';
import { useRun } from '@/lib/useCommand';

/**
 * The Files tab's open file and its unsaved draft, over the same checked file commands as the CLI:
 * loading one (a later load wins), and saving, creating, renaming or deleting it. Each command
 * resolves to the message to toast; `onWritten` runs once a create, rename or delete is done, and
 * `refresh` reloads the tree after any write.
 */
export function useOpenFile(props: {
  project: string;
  checkout: string;
  refresh: () => Promise<void>;
  onWritten: () => void;
}) {
  const { project, checkout, refresh } = props;
  const [opened, setOpened] = useState<(WorkspaceFile & { targetLine?: number }) | null>(null);
  const [openCount, setOpenCount] = useState(0);
  const [draft, setDraft] = useState('');
  const loadRequest = useRef(0);
  const run = useRun();
  const dirty = Boolean(opened && draft !== opened.text);
  const where = { project, checkout: checkout || undefined };
  const load = async (path: string, line?: number, selected = checkout) => {
    const request = ++loadRequest.current;
    const file = await run('files.read', { project, checkout: selected || undefined, path, line });
    if (!file || request !== loadRequest.current) return;
    setOpenCount((count) => count + 1);
    setOpened(file);
    setDraft(file.text);
  };
  /** No file open, and any load still running dropped. */
  const close = () => {
    loadRequest.current++;
    setOpened(null);
  };
  const save = async (): Promise<Message | undefined> => {
    if (!opened) return undefined;
    const request = loadRequest.current;
    const result = await run('files.write', {
      ...where,
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
    await refresh();
    return warningOf(result);
  };
  const openExternally = async (): Promise<Message | undefined> => {
    if (!opened) return undefined;
    const result = await run('files.open', {
      ...where,
      path: opened.path,
      line: opened.targetLine,
    });
    return result && said(`Opened ${opened.path} externally`, result);
  };
  const create = async (path: string): Promise<Message | undefined> => {
    const result = await run('files.create', { ...where, path });
    if (!result) return undefined;
    props.onWritten();
    await refresh();
    await load(path);
    return warningOf(result);
  };
  const rename = async (path: string): Promise<Message | undefined> => {
    if (!opened) return undefined;
    const result = await run('files.rename', {
      ...where,
      from: opened.path,
      path,
      revision: opened.revision,
    });
    if (!result) return undefined;
    props.onWritten();
    await refresh();
    await load(path);
    return warningOf(result);
  };
  const remove = async (): Promise<Message | undefined> => {
    if (!opened) return undefined;
    const result = await run('files.delete', {
      ...where,
      path: opened.path,
      revision: opened.revision,
    });
    if (!result) return undefined;
    props.onWritten();
    setOpened(null);
    await refresh();
    return warningOf(result);
  };
  return {
    opened,
    openCount,
    draft,
    setDraft,
    dirty,
    load,
    close,
    save,
    openExternally,
    create,
    rename,
    remove,
  };
}
