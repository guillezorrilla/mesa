import type { GcpLogs } from '@mesa/core';
import { ChevronDown, Layers } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { useOptional } from '@/lib/useCommand';
import { projectsLabel } from '../cloudLines';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { CloudProjectPicker } from './CloudProjectPicker';

/**
 * The Logs toolbar's project switcher (CONTEXT.md, Cloud Logs), like the Cloud Console's Select a
 * resource: the projects read, opening the project list (CloudProjectPicker) with Recent, Starred
 * and All. Apply reads the projects ticked; a project's name alone switches to just it. The envs
 * stay; new projects' log-based metrics can become saved views.
 */
export function CloudProjectSwitcher(props: { gcp: GcpLogs; onSwitched: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 max-w-56 gap-1.5 text-xs"
        aria-label={`Projects: ${props.gcp.projects.join(', ')}`}
        onClick={() => setOpen(true)}
      >
        <Layers aria-hidden />
        <span className="truncate">{projectsLabel(props.gcp.projects)}</span>
        <ChevronDown aria-hidden className="text-muted-foreground" />
      </Button>
      {open && (
        <SwitchDialog
          gcp={props.gcp}
          onClose={() => setOpen(false)}
          onSwitched={() => {
            setOpen(false);
            props.onSwitched();
          }}
        />
      )}
    </>
  );
}

function SwitchDialog(props: { gcp: GcpLogs; onClose: () => void; onSwitched: () => void }) {
  const found = useOptional('logs.gcpProjects', {});
  const { logs, setup, star, importMetrics } = useCloudLogsConfig();
  const [picked, setPicked] = useState(props.gcp.projects);
  const [importing, setImporting] = useState(true);
  const [busy, setBusy] = useState(false);
  const { recentProjects = [], starredProjects = [] } = logs ?? {};
  const added = (projects: string[]) => projects.filter((p) => !props.gcp.projects.includes(p));
  const apply = async (projects: string[]) => {
    setBusy(true);
    const saved = await setup(projects, props.gcp.envs);
    if (saved && importing) await importMetrics(added(projects));
    setBusy(false);
    if (saved) props.onSwitched();
  };
  const fix = (found.error?.details as { fix?: string } | undefined)?.fix;
  const unchanged =
    picked.length === props.gcp.projects.length &&
    picked.every((p) => props.gcp.projects.includes(p));
  return (
    <Dialog open onOpenChange={(next) => !next && props.onClose()}>
      <DialogContent
        data-testid="cloud-project-switcher"
        className="max-h-[calc(100dvh-2rem)] sm:max-w-4xl"
      >
        <DialogHeader>
          <DialogTitle>Select projects</DialogTitle>
          <DialogDescription>
            The GCP projects Cloud Logs reads together. A name alone switches to just that project.
          </DialogDescription>
        </DialogHeader>
        <CloudProjectPicker
          projects={found.data?.projects}
          groups={found.data?.groups}
          current={found.data?.current}
          picked={picked}
          onPicked={setPicked}
          error={found.error && !found.busy ? { message: found.error.message, fix } : undefined}
          onRetry={() => void found.refresh()}
          recent={recentProjects}
          starred={starredProjects}
          onStar={(project, on) => void star(project, on)}
          onOpen={(project) => void apply([project])}
          tab={recentProjects.length ? 'recent' : 'all'}
        />
        <DialogFooter className="items-center sm:justify-between">
          <Label className="gap-2 text-xs font-normal text-muted-foreground">
            <Checkbox checked={importing} onCheckedChange={(on) => setImporting(on === true)} />
            Turn new projects' log-based metrics into saved views
          </Label>
          <div className="flex gap-2">
            <Button variant="outline" onClick={props.onClose}>
              Cancel
            </Button>
            <Button
              disabled={!picked.length || unchanged || busy}
              onClick={() => void apply(picked)}
            >
              {busy
                ? 'Switching'
                : `Apply ${picked.length} ${picked.length === 1 ? 'project' : 'projects'}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
