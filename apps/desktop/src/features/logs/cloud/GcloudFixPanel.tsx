import type { GcloudAction } from '@mesa/core';
import { LOGIN_COMMAND } from '@mesa/core/browser';
import { LoaderCircle, LogIn, Power, SquareTerminal, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { CopyField } from '@/components/CopyField';
import { Button } from '@/components/ui/button';
import { useCall, useRun } from '@/lib/useCommand';

type Step =
  | { step: 'idle' }
  | { step: 'signing' }
  | { step: 'confirming' }
  | { step: 'enabling' }
  | { step: 'failed'; message: string };

/**
 * What fixes a failed Cloud Logs read, done by Mesa from its own fixed commands, never from the
 * error's text (CONTEXT.md, Cloud Logs): Sign in to Google Cloud runs `gcloud auth login`
 * (`logs.login`), waits while the person finishes in the browser (Cancel stops waiting), and reads
 * again once it ends; a failure offers Open in a terminal, a terminal session running the same
 * command. Enable turns on Error Reporting in `project` once the person confirms the change. Copy
 * stays for the person's own terminal.
 */
export function GcloudFixPanel(props: {
  action?: GcloudAction;
  fix?: string;
  project?: string;
  /** Reads again once the fix is done. */
  onFixed?: () => void;
}) {
  const call = useCall();
  const run = useRun();
  const [state, setState] = useState<Step>({ step: 'idle' });
  // A sign-in the person cancelled can still end later; its result is then ignored.
  const attempt = useRef(0);
  const settle = (done: { ok: boolean; error?: { message: string } }) => {
    if (done.ok) {
      setState({ step: 'idle' });
      props.onFixed?.();
    } else setState({ step: 'failed', message: done.error?.message ?? '' });
  };
  const signIn = async () => {
    const mine = ++attempt.current;
    setState({ step: 'signing' });
    const done = await call('logs.login');
    if (mine === attempt.current) settle(done);
  };
  const enable = async (project: string) => {
    setState({ step: 'enabling' });
    settle(await call('logs.enable', { project }));
  };
  const copy = props.fix && <CopyField value={props.fix} />;
  if (props.action === 'login' && state.step === 'signing')
    return (
      <div className="flex items-center gap-2" role="status">
        <LoaderCircle aria-hidden className="size-3.5 animate-spin" />
        <span>Finish signing in in your browser</span>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => {
            attempt.current++;
            setState({ step: 'idle' });
          }}
        >
          <X aria-hidden /> Cancel
        </Button>
      </div>
    );
  const failed = state.step === 'failed' && <p className="text-xs">{state.message}</p>;
  if (props.action === 'login')
    return (
      <div className="grid justify-items-start gap-2">
        {failed}
        <span className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => void signIn()}>
            <LogIn aria-hidden /> Sign in to Google Cloud
          </Button>
          {state.step === 'failed' && (
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                void run('sessions.open', { general: true, terminal: true, run: LOGIN_COMMAND })
              }
            >
              <SquareTerminal aria-hidden /> Open in a terminal
            </Button>
          )}
        </span>
        {copy}
      </div>
    );
  const project = props.project;
  if (props.action === 'enable' && project)
    return (
      <div className="grid justify-items-start gap-2">
        {failed}
        <Button
          size="sm"
          disabled={state.step === 'enabling'}
          onClick={() => setState({ step: 'confirming' })}
        >
          <Power aria-hidden /> {state.step === 'enabling' ? 'Enabling' : 'Enable'}
        </Button>
        {copy}
        {state.step === 'confirming' && (
          <ActionDialog
            testId="enable-api-dialog"
            title={`Turn on Error Reporting in ${project}?`}
            description={`This enables the Error Reporting API in the GCP project ${project}: a change to that project, for everyone who uses it. Mesa then reads its error groups and their New and Back again badges.`}
            submit={{ label: 'Enable', testId: 'confirm-enable-api', disabled: false }}
            onSubmit={() => void enable(project)}
            onCancel={() => setState({ step: 'idle' })}
          />
        )}
      </div>
    );
  return copy || null;
}
