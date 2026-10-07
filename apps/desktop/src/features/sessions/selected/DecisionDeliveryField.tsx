import type { DecisionDeliveryStatus, DeliveryStatus } from '@mesa/core';
import { shortAgo } from '@mesa/core/browser';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';

const LABEL: Record<DeliveryStatus['state'], string> = {
  configured: 'Configured',
  disabled: 'Disabled',
  missing: 'Missing',
  conflicting: 'Conflicting',
  unsupported: 'Unsupported',
};

/** One channel: what is configured, or why not, beside what Mesa last saw happen. */
function Channel(props: { name: string; seen: string; status: DeliveryStatus; now: number }) {
  const { name, seen, status, now } = props;
  return (
    <li title={status.reason}>
      <span className="font-medium">{name}</span> {LABEL[status.state]}: {status.reason}.{' '}
      <span className="text-muted-foreground">
        {status.observedAt ? `${seen} ${shortAgo(status.observedAt, now)}` : `${seen}: never yet`}
      </span>
    </li>
  );
}

/**
 * How a session's agent reaches decision assistance (#463): the decision_evaluate tool and
 * automatic advice, each configured or why not (disabled, missing, conflicting, unsupported) beside
 * when Mesa observed it, and the restart a session started without the tool needs. Configuration
 * is not proof the agent read the advice; only its transcript shows that.
 */
export function DecisionDeliveryField(props: {
  status: DecisionDeliveryStatus;
  acting: boolean;
  onRestart: () => void;
}) {
  const { status, acting, onRestart } = props;
  const now = Date.now();
  return (
    <div data-testid="session-decision-delivery" className="grid gap-1">
      <ul className="grid gap-0.5">
        <Channel name="Tool" seen="Last call" status={status.tool} now={now} />
        <Channel name="Advice" seen="Last sent" status={status.advice} now={now} />
      </ul>
      {status.tool.action === 'restart' && (
        <Button size="sm" variant="outline" disabled={acting} onClick={onRestart}>
          <RotateCcw aria-hidden /> Restart to add the tool
        </Button>
      )}
    </div>
  );
}
