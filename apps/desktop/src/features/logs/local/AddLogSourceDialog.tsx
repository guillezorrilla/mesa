import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { SegmentedControl } from '@/components/SegmentedControl';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { LogFilePanel } from './LogFilePanel';
import { ServiceLogPanel } from './ServiceLogPanel';
import { useServiceName } from './useServiceName';

type Kind = 'docker' | 'jetbrains' | 'terminal' | 'file';

const KINDS = [
  ['docker', 'Docker'],
  ['jetbrains', 'JetBrains IDEs'],
  // VS Code is named in its guide, so every label stays on one line.
  ['terminal', 'Terminal'],
  ['file', 'Log file'],
] as const;

/**
 * Add a log source: however the project's server runs, a short guide to let the Logs panel read
 * it. Docker needs nothing; a JetBrains IDE saves its console to the file Mesa names; a terminal
 * runs it through `mesa logs run`; a log file anywhere is kept for the project. A new source
 * closes it and is picked.
 */
export function AddLogSourceDialog(props: {
  project: string;
  onFound: (source: string) => void;
  onClose: () => void;
}) {
  const [kind, setKind] = useState<Kind>('jetbrains');
  const service = useServiceName(props.project);
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="add-log-source-dialog"
        // Its rows may hold long paths: each grid child may shrink, so they truncate.
        className="sm:max-w-xl [&>*]:min-w-0"
      >
        <DialogHeader>
          <DialogTitle>Add a log source</DialogTitle>
          <DialogDescription>
            How does this project's server run? Mesa reads its output from there.
          </DialogDescription>
        </DialogHeader>
        <SegmentedControl<Kind>
          label="Where it runs"
          options={KINDS}
          value={kind}
          onChange={setKind}
          wide
        />
        {kind === 'docker' ? (
          <Muted className="text-sm">
            Nothing to do: Mesa reads every running container, and those that stopped within the
            hour, by itself. Start yours (for example{' '}
            <code className="font-mono">docker compose up</code>) and pick it in the source list.
          </Muted>
        ) : kind === 'file' ? (
          <LogFilePanel project={props.project} onFound={props.onFound} />
        ) : (
          <ServiceLogPanel
            project={props.project}
            kind={kind}
            service={service}
            onFound={props.onFound}
          />
        )}
        <DialogFooter>
          <Button variant="outline" onClick={props.onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
