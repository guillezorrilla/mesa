import { FEEDBACK_MAX, FIXED_SHORTCUTS } from '@mesa/core/browser';
import { Paperclip, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Kbd } from '@/components/Kbd';
import { useToast } from '@/components/Toast';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { pressed } from '@/lib/shortcutKeys';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';

const SEND = FIXED_SHORTCUTS.sendFeedback;
/** How close to the limit the count of characters left shows. */
const COUNT_FROM = FEEDBACK_MAX - 500;

/**
 * Feedback written in Mesa and sent through the broker to a private repo (ADR-0025). The line under
 * the message is exactly what goes with it, so nothing sent is a surprise. A failure keeps the
 * text and says why; a send closes with a toast.
 */
export function FeedbackDialog(props: { from: string; onClose: () => void }) {
  const [message, setMessage] = useState('');
  const [error, setError] = useState<string>();
  const { acting, act } = useAct();
  const call = useCall();
  const toast = useToast();
  const { data: about } = useCommand('about');
  const send = () =>
    void act(async () => {
      setError(undefined);
      const result = await call('feedback.send', { message, from: props.from });
      if (!result.ok) {
        setError(result.error.message);
        return undefined;
      }
      props.onClose();
      toast('Thanks, feedback sent', 'confirmation');
      return undefined;
    });
  return (
    <ActionDialog
      testId="feedback-dialog"
      title="Send feedback"
      description="Goes privately to Mesa's maker, with your Mesa version and the screen you were on. Nothing else is sent."
      submit={{
        label: acting ? 'Sending...' : 'Send feedback',
        testId: 'send-feedback',
        disabled: acting || !message.trim(),
      }}
      onSubmit={send}
      onCancel={props.onClose}
    >
      <div className="grid min-w-0 gap-2">
        <Label htmlFor="feedback-message" className="sr-only">
          Feedback
        </Label>
        <Textarea
          id="feedback-message"
          autoFocus
          rows={6}
          maxLength={FEEDBACK_MAX}
          value={message}
          onChange={(event) => setMessage(event.target.value)}
          onKeyDown={(event) => {
            if (!pressed(event, SEND)) return;
            event.preventDefault();
            event.currentTarget.form?.requestSubmit();
          }}
          placeholder="What worked, what got in the way, or what you wish Mesa did"
          className="max-h-72 min-h-32 resize-none"
        />
        <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
          {/* Shown at once: the version fills in when `mesa about` answers, so nothing shifts. */}
          <span
            data-testid="feedback-attached"
            title="Sent with your message"
            className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-dashed px-2 py-1 font-mono"
          >
            <Paperclip aria-hidden className="size-3 shrink-0" />
            <span className="break-words">
              {about ? `Mesa ${about.version} (build ${about.build})` : 'Mesa version'}, from{' '}
              {props.from}
            </span>
          </span>
          <span className="ml-auto inline-flex shrink-0 items-center gap-1.5">
            {message.length > COUNT_FROM ? (
              <span className="tabular-nums">{FEEDBACK_MAX - message.length} left</span>
            ) : (
              <>
                <Kbd shortcut={SEND} /> to send
              </>
            )}
          </span>
        </div>
      </div>
      {error && (
        <Alert variant="destructive" data-testid="feedback-error">
          <TriangleAlert aria-hidden />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
    </ActionDialog>
  );
}
