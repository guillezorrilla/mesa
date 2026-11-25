import { Check, Copy, LoaderCircle } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
import { useCall } from '@/lib/useCommand';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { LOGS_POLL_MS } from './useLogWatch';

/** One numbered step. */
function Step(props: { n: number; children: React.ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">
        {props.n}
      </span>
      <div className="min-w-0 pt-px">{props.children}</div>
    </li>
  );
}

/**
 * Shows an IntelliJ run configuration's console in the Logs panel: four steps to save it to the
 * file Mesa names (`mesa logs file`, which makes its folder), then it waits for the file, and
 * once it is there closes and hands its source back.
 */
export function IntelliJLogsDialog(props: {
  project: string;
  onFound: (source: string) => void;
  onClose: () => void;
}) {
  const call = useCall();
  const { clipboard } = usePlatform();
  const [name, setName] = useState(props.project);
  const service = useDebouncedValue(name.trim(), 300);
  /** The file `mesa logs file` named, or why it could not. */
  const [made, setMade] = useState<{ path?: string; source?: string; error?: string }>({});
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let gone = false;
    setMade({});
    setCopied(false);
    if (!service) return;
    void call('logs.file', { name: service, project: props.project }).then((result) => {
      if (!gone) setMade(result.ok ? result.data : { error: result.error.message });
    });
    return () => {
      gone = true;
    };
  }, [call, service, props.project]);
  const { path, source, error } = made;
  // The panel renders on every read; the latest callback, without restarting the wait.
  const onFound = useRef(props.onFound);
  onFound.current = props.onFound;
  /** The file was there before the wait began: offered, not picked by itself. */
  const [already, setAlready] = useState(false);
  useEffect(() => {
    setAlready(false);
    if (!source) return;
    /** Whether the file was there at the first look; undefined until a look answers. */
    let before: boolean | undefined;
    const look = () =>
      void call('logs.sources', { project: props.project }).then((found) => {
        if (!found.ok) return;
        const there = found.data.sources.some((each) => each.id === source);
        if (before === undefined) {
          before = there;
          setAlready(there);
        } else if (there && !before) onFound.current(source);
      });
    look();
    const timer = window.setInterval(look, LOGS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [call, source, props.project]);
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent data-testid="intellij-logs-dialog" className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Show IntelliJ logs</DialogTitle>
          <DialogDescription>
            IntelliJ keeps its console to itself. Save it to a file once, and the Logs panel reads
            it every time you run the service.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-1.5">
          <Label htmlFor="intellij-service">Service name</Label>
          <Input
            id="intellij-service"
            value={name}
            onChange={(event) => setName(event.currentTarget.value)}
          />
        </div>
        <ol className="grid gap-3 text-sm">
          <Step n={1}>
            In IntelliJ, open <b>Run &gt; Edit Configurations</b> and pick the service.
          </Step>
          <Step n={2}>
            Click <b>Modify options &gt; Save console output to file</b>.
          </Step>
          <Step n={3}>
            Paste this path:
            {error ? (
              <p role="alert" className="mt-1.5 text-xs text-state-failed">
                {error}
              </p>
            ) : (
              <div className="mt-1.5 flex items-center gap-1 rounded-md border bg-muted/40 py-1 pr-1 pl-2.5">
                <code
                  data-testid="intellij-log-path"
                  className="min-w-0 flex-1 truncate font-mono text-xs"
                  title={path}
                >
                  {path ?? '...'}
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!path}
                  // The app's pasteboard: WKWebView refuses navigator.clipboard.
                  onClick={() => path && void clipboard.write(path).then(() => setCopied(true))}
                >
                  {copied ? <Check aria-hidden /> : <Copy aria-hidden />}
                  {copied ? 'Copied' : 'Copy'}
                </Button>
              </div>
            )}
          </Step>
          <Step n={4}>
            Click <b>Apply</b>, then run it.
          </Step>
        </ol>
        <DialogFooter className="items-center sm:justify-between">
          <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
            {already ? (
              'IntelliJ already saves this service here.'
            ) : source ? (
              <>
                <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
                Waiting for IntelliJ to write the first line
              </>
            ) : null}
          </p>
          <div className="flex gap-2">
            <Button variant="outline" onClick={props.onClose}>
              Close
            </Button>
            {already && source && <Button onClick={() => props.onFound(source)}>Show it</Button>}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
