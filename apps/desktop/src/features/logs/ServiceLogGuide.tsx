import { LoaderCircle } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { CopyField } from '@/components/CopyField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NativeSelect, NativeSelectOption } from '@/components/ui/native-select';
import { type ServiceName, useServiceName } from './useServiceName';
import { useSourceWait } from './useSourceWait';

/** The service picker's last item, for a name that is not a module. */
const OTHER = '#other';

/** One numbered step. */
function Step(props: { n: number; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[1.25rem_minmax(0,1fr)] gap-2">
      <span className="flex size-5 items-center justify-center rounded-full bg-muted text-[11px] font-medium tabular-nums">
        {props.n}
      </span>
      <div className="grid min-w-0 gap-1.5 pt-px">{props.children}</div>
    </li>
  );
}

/** The service's name: a pick of the project's modules, or a name typed. */
function ServiceField(props: { service: ServiceName }) {
  const { modules, name, setName } = props.service;
  const custom = !modules?.length || !modules.includes(name);
  return (
    <div className="grid gap-1.5">
      <Label htmlFor="log-service">Service</Label>
      {modules?.length ? (
        <NativeSelect
          id="log-service"
          value={custom ? OTHER : name}
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
      {custom && (
        <Input
          id={modules?.length ? undefined : 'log-service'}
          aria-label={modules?.length ? 'Another service name' : undefined}
          autoFocus={Boolean(modules?.length)}
          value={name}
          onChange={(event) => setName(event.currentTarget.value)}
        />
      )}
    </div>
  );
}

/** A JetBrains IDE's run configuration, saving its console to the file Mesa names. */
function JetBrainsSteps(props: { service: ServiceName }) {
  return (
    <ol className="grid gap-3 text-sm">
      <Step n={1}>
        <span>
          In IntelliJ IDEA, WebStorm, PyCharm, GoLand or Rider, open{' '}
          <b>Run &gt; Edit Configurations</b> and pick the service.
        </span>
      </Step>
      <Step n={2}>
        <span>
          Click <b>Modify options &gt; Logs &gt; Save console output to file</b>.
        </span>
      </Step>
      <Step n={3}>
        <span>Paste this path:</span>
        <CopyField
          value={props.service.file.path}
          testId="log-file-path"
          onCopied={props.service.copied}
        />
      </Step>
      <Step n={4}>
        <span>
          Click <b>Apply</b>, then run it.
        </span>
      </Step>
    </ol>
  );
}

/** A VS Code task that runs `line`, its output kept for the Logs panel. */
const vscodeTask = (name: string, line: string) =>
  JSON.stringify(
    {
      label: `${name} (logs in Mesa)`,
      type: 'shell',
      command: line,
      isBackground: true,
      problemMatcher: [],
    },
    null,
    2,
  );

/** Any terminal, VS Code's too, running the service through `mesa logs run`. */
function TerminalSteps(props: { service: ServiceName }) {
  const { service } = props;
  const [command, setCommand] = useState('');
  const line = `mesa logs run ${service.service ?? '<service>'} -- ${command.trim() || 'pnpm dev'}`;
  return (
    <ol className="grid gap-3 text-sm">
      <Step n={1}>
        <Label htmlFor="log-command">The command that starts it</Label>
        <Input
          id="log-command"
          placeholder="pnpm dev"
          value={command}
          onChange={(event) => setCommand(event.currentTarget.value)}
        />
      </Step>
      <Step n={2}>
        <span>Run it through Mesa, in any terminal in the project folder:</span>
        <CopyField
          value={service.service && line}
          testId="log-run-line"
          onCopied={service.copied}
        />
      </Step>
      <Step n={3}>
        <span>
          Or as a VS Code task, in <code className="font-mono text-xs">.vscode/tasks.json</code>:
        </span>
        <CopyField
          multiline
          value={service.service && vscodeTask(service.service, line)}
          testId="log-run-task"
          onCopied={service.copied}
        />
      </Step>
    </ol>
  );
}

/**
 * A service whose output Mesa cannot see by itself, kept in the project's log folder under its
 * name: a JetBrains IDE saving its console there, or a terminal running it through `mesa logs
 * run`. Once a path or a line is copied it waits for the file, and hands its source back.
 */
export function ServiceLogGuide(props: {
  project: string;
  kind: 'jetbrains' | 'terminal';
  onFound: (source: string) => void;
}) {
  const service = useServiceName(props.project);
  const source = service.waitingFor;
  const already = useSourceWait(props.project, source, props.onFound);
  const Steps = props.kind === 'jetbrains' ? JetBrainsSteps : TerminalSteps;
  return (
    <div className="grid gap-4">
      <ServiceField service={service} />
      {service.file.error ? (
        <p role="alert" className="text-xs text-state-failed">
          {service.file.error}
        </p>
      ) : (
        <Steps service={service} />
      )}
      <div className="flex min-h-8 items-center justify-between gap-2">
        <p role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
          {already ? (
            'Mesa already reads this service.'
          ) : source ? (
            <>
              <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
              Waiting for the first line
            </>
          ) : (
            'Copy the path or the line to start.'
          )}
        </p>
        {already && source && (
          <Button size="sm" onClick={() => props.onFound(source)}>
            Show it
          </Button>
        )}
      </div>
    </div>
  );
}
