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
import { LogFileGuide } from './LogFileGuide';
import { ServiceLogGuide } from './ServiceLogGuide';

type Kind = 'docker' | 'jetbrains' | 'terminal' | 'file';

const KINDS = [
  ['docker', 'Docker'],
  ['jetbrains', 'JetBrains IDEs'],
  ['terminal', 'Terminal or VS Code'],
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
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent data-testid="add-log-source-dialog" className="sm:max-w-xl">
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
          <LogFileGuide project={props.project} onFound={props.onFound} />
        ) : (
          <ServiceLogGuide key={kind} project={props.project} kind={kind} onFound={props.onFound} />
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
