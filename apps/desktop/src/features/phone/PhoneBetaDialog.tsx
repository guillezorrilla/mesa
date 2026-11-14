import type { Config } from '@mesa/core';
import { linkQr, PHONE_BETA_URL } from '@mesa/core/browser';
import { ArrowUpRight, Smartphone } from 'lucide-react';
import { type ReactNode, useState } from 'react';
import { ExternalLink } from '@/components/ExternalLink';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useCommand, useRun } from '@/lib/useCommand';

const FORM_QR = `data:image/svg+xml;utf8,${encodeURIComponent(linkQr(PHONE_BETA_URL).svg)}`;

/**
 * The one-time offer of the iPhone app's TestFlight beta, on the first launch after the update
 * that brings it or once onboarding is over: shown while `onboarding.phoneBeta` is pending and
 * the profile has no paired phone. Closing it, or going to Settings > Phone, writes `dismissed`,
 * so it never comes back; opening the form keeps it up for the pairing step.
 */
export function PhoneBetaOffer(props: {
  config: Config | undefined;
  /** False while onboarding, loading, or another dialog is up. */
  allowed: boolean;
  onChanged: () => void;
  onPhoneSettings: () => void;
}) {
  const run = useRun();
  const [closed, setClosed] = useState(false);
  const onboarding = props.config?.onboarding;
  if (
    closed ||
    !props.allowed ||
    onboarding?.phoneBeta !== 'pending' ||
    onboarding.status === 'active'
  )
    return null;
  const dismiss = async () => {
    setClosed(true);
    if (await run('config.set', { path: 'onboarding.phoneBeta', value: 'dismissed' }))
      props.onChanged();
  };
  return (
    <PhoneBetaDialog
      onClose={() => void dismiss()}
      onPhoneSettings={() => {
        void dismiss();
        props.onPhoneSettings();
      }}
    />
  );
}

function PhoneBetaDialog(props: { onClose: () => void; onPhoneSettings: () => void }) {
  const status = useCommand('phone.status');
  // Waits for the status, so a paired profile never sees it flash.
  if (!status.data || status.data.paired) return null;
  return (
    <Dialog open onOpenChange={(open) => !open && props.onClose()}>
      <DialogContent
        data-testid="phone-beta-dialog"
        className="gap-0 overflow-hidden p-0 sm:max-w-xl"
      >
        <div className="grid sm:grid-cols-[1fr_auto]">
          <div className="flex min-w-0 flex-col gap-6 p-6">
            <DialogHeader className="gap-3 text-left">
              <div className="flex items-center gap-2">
                <span className="grid size-8 place-items-center rounded-lg bg-primary/10 text-primary">
                  <Smartphone className="size-4" aria-hidden />
                </span>
                <Badge variant="secondary">TestFlight beta</Badge>
              </div>
              <DialogTitle className="text-xl">Mesa is on your iPhone</DialogTitle>
              <DialogDescription>
                Follow your sessions, answer their questions, review pull requests and get a push
                when an agent needs you, away from your Mac.
              </DialogDescription>
            </DialogHeader>
            <ol className="grid gap-5">
              <Step
                n={1}
                title="Request an invite"
                line="Send your email and TestFlight invites you to the beta."
              >
                <Button asChild size="sm">
                  <ExternalLink href={PHONE_BETA_URL} className="">
                    Request TestFlight access
                    <ArrowUpRight aria-hidden />
                  </ExternalLink>
                </Button>
              </Step>
              <Step
                n={2}
                title="Pair it with this Mac"
                line="Install the app from the invite, then press Pair phone in Settings > Phone and scan the QR code with it."
              >
                <Button size="sm" variant="secondary" onClick={props.onPhoneSettings}>
                  Open Settings &gt; Phone
                </Button>
              </Step>
            </ol>
          </div>
          <figure className="flex flex-col items-center justify-center gap-3 border-t bg-muted/40 p-6 sm:border-t-0 sm:border-l">
            <img
              alt="QR code that opens the TestFlight invite form"
              src={FORM_QR}
              className="size-36 rounded-md bg-white p-1.5 shadow-xs"
            />
            <figcaption className="max-w-36 text-center text-xs text-muted-foreground">
              Scan with your iPhone's camera to request the invite there
            </figcaption>
          </figure>
        </div>
        <DialogFooter className="border-t px-6 py-3">
          <Button size="sm" variant="ghost" onClick={props.onClose}>
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** A numbered step: its title, one line, and the action that does it. */
function Step(props: { n: number; title: string; line: string; children: ReactNode }) {
  return (
    <li className="flex gap-3">
      <span
        aria-hidden
        className="mt-px grid size-5 shrink-0 place-items-center rounded-full border text-[11px] font-medium text-muted-foreground tabular-nums"
      >
        {props.n}
      </span>
      <div className="grid min-w-0 justify-items-start gap-2">
        <div className="grid gap-0.5">
          <p className="text-sm font-medium">{props.title}</p>
          <p className="text-sm text-muted-foreground">{props.line}</p>
        </div>
        {props.children}
      </div>
    </li>
  );
}
