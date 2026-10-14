import type { PrSetupRow } from '@mesa/core';
import { PR_CLIS } from '@mesa/core/browser';
import { Check, Copy, Loader2, SquareTerminal } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall, useCommand, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { useSharedPrs } from './usePrs';

type Step = { title: string; how: ReactNode; action?: ReactNode; done: boolean };

/**
 * Connects a project's PR provider: install its CLI with Homebrew, sign in (and, on Bitbucket,
 * add the Bitbucket token) in a terminal session running the command, then check by listing the
 * project's PRs. Install and sign-in are read from `mesa prs setup`, so leaving and coming back
 * resumes there.
 */
export function PrSetupScreen(props: { project: string; onSession: (id: string) => void }) {
  const setup = useCommand('prs.setup', { project: props.project });
  const shared = useSharedPrs();
  const call = useCall();
  const run = useRun();
  const toast = useToast();
  const { clipboard } = usePlatform();
  const [busy, setBusy] = useState(false);
  const [noBrew, setNoBrew] = useState(false);
  // Opened, not proven: `twg whoami` cannot see the Bitbucket token, so Check is the proof.
  const [connected, setConnected] = useState(false);
  const [checked, setChecked] = useState<'ok' | string>();
  const row: PrSetupRow | undefined = setup.data?.find((r) => r.project === props.project);
  if (!row)
    return <Muted>{setup.busy || !setup.data ? 'Reading setup...' : 'Unknown project.'}</Muted>;
  if (!row.provider)
    return <Muted>{props.project}'s origin remote is not on GitHub or Bitbucket.</Muted>;
  const cli = PR_CLIS[row.provider];
  const connect = 'connect' in cli ? cli.connect : undefined;

  const copy = async (text: string) => {
    await clipboard.write(text);
    toast('Command copied', 'confirmation');
  };
  const install = async () => {
    setBusy(true);
    const result = await call('doctor.install', { name: cli.cli });
    setBusy(false);
    if (result.ok) return void setup.refresh();
    if (result.error.code === 'not_found') setNoBrew(true);
    else toast(result.error.message);
  };
  /** A terminal session in the project that runs `command`, shown to finish it there. */
  const inTerminal = async (command: string) => {
    const opened = await run('sessions.open', {
      project: props.project,
      terminal: true,
      run: command,
    });
    if (!opened) return false;
    props.onSession(opened.id);
    return true;
  };
  // Listing the project is the proof: its blocked row or read problem says what is still missing.
  const check = async () => {
    setBusy(true);
    const list = await call('prs', { project: props.project });
    setBusy(false);
    if (!list.ok) return setChecked(list.error.message);
    const problem = list.data.problems[0]?.reason;
    const blocked = list.data.blocked[0];
    if (blocked) return setChecked(`${cli.cli} is ${blocked.state}`);
    if (problem) return setChecked(problem);
    setChecked('ok');
    void shared?.list.refresh();
  };
  const command = (text: string) => (
    <span className="inline-flex items-center gap-1">
      <code className="font-mono text-xs text-foreground">{text}</code>
      <Button
        variant="ghost"
        size="icon-sm"
        aria-label={`Copy ${text}`}
        onClick={() => void copy(text)}
      >
        <Copy aria-hidden className="size-3" />
      </Button>
    </span>
  );

  // Listing the project proves every step, so a passed Check marks them all done.
  const proven = checked === 'ok';
  const steps: Step[] = [
    {
      title: `Install ${cli.cli}`,
      done: proven || row.state !== 'missing',
      how: noBrew ? (
        <>Homebrew is not installed. Run {command(cli.manual)} in Terminal, then press Check.</>
      ) : (
        <>Installs it with Homebrew.</>
      ),
      action: (
        <Button size="sm" disabled={busy} onClick={() => void install()}>
          {busy && <Loader2 aria-hidden className="animate-spin" />}Install
        </Button>
      ),
    },
    {
      title: `Sign in to ${connect ? 'Atlassian' : cli.name}`,
      done: proven || row.state === 'ready',
      how: (
        <>
          Opens a terminal running <code className="font-mono text-foreground">{cli.signIn}</code>.
          Finish in the browser, then come back and press Check.
        </>
      ),
      action: (
        <span className="flex gap-2">
          <Button size="sm" onClick={() => void inTerminal(cli.signIn)}>
            <SquareTerminal aria-hidden />
            Open terminal
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={setup.busy}
            onClick={() => void setup.refresh()}
          >
            Check
          </Button>
        </span>
      ),
    },
    ...(connect
      ? [
          {
            title: `Connect ${cli.name}`,
            done: proven || connected,
            how: (
              <>
                Opens a terminal running{' '}
                <code className="font-mono text-foreground">{connect}</code> to add your {cli.name}{' '}
                token.
              </>
            ),
            action: (
              <Button
                size="sm"
                onClick={() => void inTerminal(connect).then((opened) => setConnected(opened))}
              >
                <SquareTerminal aria-hidden />
                Open terminal
              </Button>
            ),
          },
        ]
      : []),
    {
      title: 'Check access',
      done: proven,
      how:
        checked === undefined || checked === 'ok' ? (
          <>Reads {props.project}'s open PRs.</>
        ) : (
          <span className="text-state-failed">{checked}</span>
        ),
      action: (
        <Button size="sm" disabled={busy} onClick={() => void check()}>
          Check
        </Button>
      ),
    },
  ];
  const current = steps.findIndex((step) => !step.done);
  return (
    <section data-testid="pr-setup" className="max-w-2xl space-y-5">
      <PageHeader title={`Connect ${cli.name}`} />
      <Muted>
        {props.project} lives on {cli.name}. Mesa reads its PRs with the {cli.cli} CLI. Other
        projects keep working while you set this up.
      </Muted>
      {current === -1 ? (
        <p className="rounded-lg bg-state-idle/10 px-4 py-3 text-sm font-medium">
          {cli.name} is connected. {props.project}'s PRs are in the Reviews tab.
        </p>
      ) : null}
      <ol className="divide-y rounded-lg border bg-card">
        {steps.map((step, i) => (
          <li
            key={step.title}
            data-testid="pr-setup-step"
            data-state={step.done ? 'done' : i === current ? 'current' : 'later'}
            className={cn(
              'grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-1 p-4',
              i > current && current !== -1 && 'text-muted-foreground',
            )}
          >
            <span
              className={cn(
                'flex size-6 items-center justify-center rounded-full border text-xs',
                step.done && 'border-state-idle bg-state-idle text-background',
                i === current && 'border-state-working text-state-working',
              )}
            >
              {step.done ? <Check aria-hidden className="size-3" /> : i + 1}
            </span>
            <span className="text-sm font-medium">{step.title}</span>
            <span>
              {step.done ? (
                <span className="text-xs font-medium text-state-idle">Done</span>
              ) : i === current ? (
                step.action
              ) : null}
            </span>
            <span className="col-start-2 text-xs text-muted-foreground">{step.how}</span>
          </li>
        ))}
      </ol>
    </section>
  );
}
