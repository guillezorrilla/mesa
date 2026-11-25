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
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall } from '@/lib/useCommand';
import { useDebouncedValue } from '@/lib/useDebouncedValue';
import { LOGS_POLL_MS } from './useLogWatch';

/** The service picker's last item, for a name that is not a module. */
const OTHER = '#other';

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
 * file Mesa names (`mesa logs file`); once the path is copied it makes its folder and waits for the
 * file, and once the file is there closes and hands its source back.
 */
export function IntelliJLogsDialog(props: {
  project: string;
  onFound: (source: string) => void;
  onClose: () => void;
}) {
  const call = useCall();
  const { clipboard } = usePlatform();
  const [modules, setModules] = useState<string[]>();
  const [name, setName] = useState(props.project);
  // The project's modules are the likely services: the first is the default.
  useEffect(() => {
    void call('logs.modules', { project: props.project }).then((found) => {
      const list = found.ok ? found.data.modules : [];
      setModules(list);
      if (list[0]) setName(list[0]);
    });
  }, [call, props.project]);
  const other = !modules?.length || !modules.includes(name);
  const known = modules !== undefined;
  const settled = name.trim();
  const service = useDebouncedValue(name.trim(), 300);
  /** The file `mesa logs file` named, or why it could not. */
  const [made, setMade] = useState<{ path?: string; source?: string; error?: string }>({});
  const [copied, setCopied] = useState(false);
  /** The path was copied (Copy, or selected and copied): its folder is made and the wait begins. */
  const [waiting, setWaiting] = useState(false);
  useEffect(() => {
    let gone = false;
    setMade({});
    setCopied(false);
    setWaiting(false);
    // Once the modules are known and the name has settled, so a default or a keystroke is not asked for.
    if (!service || !known || service !== settled) return;
    void call('logs.file', { name: service, project: props.project, make: false }).then(
      (result) => {
        if (!gone) setMade(result.ok ? result.data : { error: result.error.message });
      },
    );
    return () => {
      gone = true;
    };
  }, [call, service, settled, known, props.project]);
  const { path, error } = made;
  const source = waiting ? made.source : undefined;
  /** Makes the file's folder, so IntelliJ can write there, and starts the wait. */
  const copiedPath = () => {
    if (!service || waiting) return;
    setWaiting(true);
    void call('logs.file', { name: service, project: props.project });
  };
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
          {modules?.length ? (
            <NativeSelect
              id="intellij-service"
              value={other ? OTHER : name}
              onChange={(event) => {
                const picked = event.currentTarget.value;
                setName(picked === OTHER ? '' : picked);
              }}
            >
              {modules.map((module) => (
                <NativeSelectOption key={module} value={module}>
                  {module}
                </NativeSelectOption>
              ))}
              <NativeSelectOption value={OTHER}>Another name...</NativeSelectOption>
            </NativeSelect>
          ) : null}
          {other && (
            <Input
              id={modules?.length ? undefined : 'intellij-service'}
              aria-label={modules?.length ? 'Another service name' : undefined}
              autoFocus={Boolean(modules?.length)}
              value={name}
              onChange={(event) => setName(event.currentTarget.value)}
            />
          )}
        </div>
        <ol className="grid gap-3 text-sm">
          <Step n={1}>
            In IntelliJ, open <b>Run &gt; Edit Configurations</b> and pick the service.
          </Step>
          <Step n={2}>
            Click <b>Modify options &gt; Logs &gt; Save console output to file</b>.
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
                  onCopy={copiedPath}
                  // Right to left, so a long path is cut at its start and its file name shows.
                  dir="rtl"
                  className="min-w-0 flex-1 truncate text-left font-mono text-xs"
                  title={path}
                >
                  <bdi dir="ltr">{path ?? '...'}</bdi>
                </code>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={!path}
                  // The app's pasteboard: WKWebView refuses navigator.clipboard.
                  onClick={() => {
                    if (!path) return;
                    copiedPath();
                    void clipboard.write(path).then(() => setCopied(true));
                  }}
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
