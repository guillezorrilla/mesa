import type { WorkspaceFile } from '@mesa/core';
import { ExternalLink, Pencil, RotateCw, Settings2, Trash2, X } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';

/** The open file's tab, its actions, and the path line under it, as Xirp's editor header. */
export function FileTabBar(props: {
  file: WorkspaceFile;
  dirty: boolean;
  acting: boolean;
  canOpenExternally: boolean;
  settingsOpen: boolean;
  onClose: () => void;
  onOpenExternally: () => void;
  onReload: () => void;
  onRename: () => void;
  onDelete: () => void;
  onToggleSettings: () => void;
  onSave: () => void;
}) {
  const { file } = props;
  return (
    <>
      <div className="flex shrink-0 items-stretch border-b bg-card">
        <div className="flex items-center gap-2 border-r bg-background/60 px-3 py-2">
          <h3 className="font-mono text-sm" title={file.path}>
            {file.path.split('/').at(-1)}
            {props.dirty ? ' *' : ''}
          </h3>
          <IconButton label="Close" icon={X} size="icon-xs" onClick={props.onClose} />
        </div>
        <span className="ml-auto flex items-center gap-0.5 px-2">
          <IconButton
            label="Open externally"
            icon={ExternalLink}
            disabled={!props.canOpenExternally || props.acting}
            onClick={props.onOpenExternally}
          />
          <IconButton label="Reload" icon={RotateCw} onClick={props.onReload} />
          <IconButton
            label="Rename"
            icon={Pencil}
            disabled={props.dirty}
            onClick={props.onRename}
          />
          <IconButton
            label="Delete"
            icon={Trash2}
            disabled={props.dirty}
            onClick={props.onDelete}
          />
          <IconButton
            label="Editor settings"
            icon={Settings2}
            active={props.settingsOpen}
            onClick={props.onToggleSettings}
          />
          <Button
            type="button"
            size="sm"
            className="ml-1 h-7"
            onClick={props.onSave}
            disabled={!props.dirty || props.acting}
          >
            Save
          </Button>
        </span>
      </div>
      <Muted size="xs" className="shrink-0 border-b px-4 py-1.5 font-mono">
        {file.path} · {file.path.split('.').at(-1)} · {file.lines} lines · revision{' '}
        {file.revision.slice(0, 12)}
      </Muted>
    </>
  );
}
