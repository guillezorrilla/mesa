import type { DiscoveredProject } from '@mesa/core';
import { FolderOpen, FolderSearch } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { usePlatform } from '@/lib/MesaRoot';
import { useAct } from '@/lib/useAct';
import { useRun } from '@/lib/useCommand';
import { DiscoveredProjectRow } from './DiscoveredProjectRow';

export function ImportWorkspaceDialog(props: {
  onCancel: () => void;
  onRegistered: () => Promise<void>;
  returnFocus?: HTMLElement | null;
}) {
  const [path, setPath] = useState('');
  const [discovered, setDiscovered] = useState<DiscoveredProject[]>();
  const { pickFolder } = usePlatform();
  const { acting, act } = useAct();
  const run = useRun();
  const changePath = (value: string) => {
    setPath(value);
    setDiscovered(undefined);
  };
  return (
    <Dialog open onOpenChange={(open) => !open && !acting && props.onCancel()}>
      <DialogContent
        data-testid="import-workspace-dialog"
        className="max-h-[calc(100vh-2rem)] overflow-y-auto sm:max-w-xl"
        onCloseAutoFocus={
          props.returnFocus
            ? (event) => {
                event.preventDefault();
                props.returnFocus?.focus();
              }
            : undefined
        }
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FolderSearch aria-hidden className="size-5 text-ring" />
            Import a workspace
          </DialogTitle>
          <DialogDescription>
            Scan a folder, then choose which projects to import.
          </DialogDescription>
        </DialogHeader>
        <form
          className="space-y-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!path.trim()) return;
            void act(async () => {
              const found = await run('projects.discover', { path: path.trim() });
              if (found) setDiscovered(found);
              return undefined;
            });
          }}
        >
          <Label htmlFor="workspace-path">Workspace path</Label>
          <div className="flex items-center gap-2">
            <Input
              id="workspace-path"
              placeholder="/path/to/workspace"
              className="font-mono"
              value={path}
              disabled={acting}
              onChange={(event) => changePath(event.target.value)}
            />
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Choose workspace folder"
              disabled={acting}
              onClick={() =>
                void act(async () => {
                  const chosen = await pickFolder();
                  if (chosen) changePath(chosen);
                  return undefined;
                })
              }
            >
              <FolderOpen aria-hidden />
            </Button>
            <Button type="submit" data-testid="discover-projects" disabled={acting || !path.trim()}>
              {acting ? 'Working...' : 'Scan'}
            </Button>
          </div>
        </form>
        {discovered && (
          <div data-testid="discovered-projects" className="max-h-80 space-y-2 overflow-y-auto">
            {discovered.length === 0 && (
              <Muted>No projects found within three folder levels.</Muted>
            )}
            {discovered.map((candidate) => (
              <DiscoveredProjectRow
                key={candidate.path}
                project={candidate}
                verb="Import"
                disabled={acting}
                onRegister={() =>
                  void act(async () => {
                    const registered = await run('projects.register', { path: candidate.path });
                    if (!registered) return undefined;
                    setDiscovered((rows) =>
                      rows?.map((row) =>
                        row.path === candidate.path ? { ...row, registered: true } : row,
                      ),
                    );
                    await props.onRegistered();
                    return warningOf(registered);
                  })
                }
              />
            ))}
          </div>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" disabled={acting} onClick={props.onCancel}>
            {discovered ? 'Done' : 'Cancel'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
