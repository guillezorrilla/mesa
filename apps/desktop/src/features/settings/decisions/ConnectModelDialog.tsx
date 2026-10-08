import { CODEX_REVIEW_TITLE, type SystemOneProvider } from '@mesa/core/browser';
import { type ReactNode, useId, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { warningOf } from '@/components/Toast';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useUpdateHooks } from '@/features/hooks/useUpdateHooks';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';
import { MODELS } from './models';

type Failure = { code: string; message: string };
/** After a Connect: hooks that need an update for the advice, then Codex's review of them. */
type Next = { step: 'hooks' } | { step: 'codex'; review: string };

/**
 * Connects a hosted model: for CLEF its Cloudflare account ID, then its key, each labelled with
 * where to find it, over one line on price and one on privacy. Connect tests the key with one call
 * and saves it (`decisions.keys.set`, the key on stdin) and closes; a refused key says so in
 * place. While it is tested the key stays in its field, masked and locked, so it does not seem to
 * vanish; a refused key is cleared for the next try, and a saved one leaves with the dialog.
 * When Mesa's hooks then need an update (#678), it stays open for that one more step instead.
 */
export function ConnectModelDialog(props: {
  model: SystemOneProvider;
  /** The account ID config.yaml keeps, prefilled for CLEF. */
  account: string | undefined;
  /** Replace key on a connected model: the same dialog, titled for it. */
  replacing: boolean;
  onConnected: () => Promise<void>;
  onClose: () => void;
}) {
  const { label, provider, secret, sentence, price, privacy, keyHelp, accountHelp } =
    MODELS[props.model];
  const call = useCall();
  const { acting, act } = useAct();
  const [key, setKey] = useState('');
  const [account, setAccount] = useState(props.account ?? '');
  const [failure, setFailure] = useState<Failure>();
  const [next, setNext] = useState<Next>();
  const update = useUpdateHooks();
  const id = useId();
  const needsAccount = accountHelp !== undefined;
  const connect = () =>
    void act(async () => {
      setFailure(undefined);
      const saved = await call('decisions.keys.set', {
        provider,
        key,
        ...(needsAccount ? { account: account.trim() } : {}),
      });
      if (!saved.ok) {
        setKey('');
        setFailure(saved.error);
        return undefined;
      }
      await props.onConnected();
      const hooks = await call('hooks.status');
      if (hooks.ok && hooks.data.needsUpdate) setNext({ step: 'hooks' });
      else props.onClose();
      return undefined;
    });
  if (next?.step === 'hooks')
    return (
      <ActionDialog
        testId={`connect-${props.model}`}
        title={`${label} connected`}
        description="One more step: update Mesa's session hooks so your agents get the advice."
        submit={{
          label: acting ? 'Updating...' : 'Update hooks',
          testId: `connect-${props.model}-hooks`,
          disabled: acting,
        }}
        onSubmit={() =>
          void act(async () => {
            const updated = await update();
            if (updated?.codexReview) setNext({ step: 'codex', review: updated.codexReview });
            else if (updated) props.onClose();
            return warningOf(updated?.result);
          })
        }
        onCancel={props.onClose}
      >
        {null}
      </ActionDialog>
    );
  if (next?.step === 'codex')
    return (
      <ActionDialog
        testId={`connect-${props.model}`}
        title={CODEX_REVIEW_TITLE}
        description={next.review}
        submit={{ label: 'Done', testId: `connect-${props.model}-done`, disabled: false }}
        onSubmit={props.onClose}
        onCancel={props.onClose}
      >
        {null}
      </ActionDialog>
    );
  return (
    <ActionDialog
      testId={`connect-${props.model}`}
      title={props.replacing ? `Replace the ${label} ${secret}` : `Connect ${label}`}
      description={sentence}
      submit={{
        label: acting ? 'Connecting...' : 'Connect',
        testId: `connect-${props.model}-submit`,
        disabled: acting || !key.trim() || (needsAccount && !account.trim()),
      }}
      onSubmit={connect}
      onCancel={props.onClose}
    >
      {needsAccount && (
        <Field id={`${id}-account`} label="Account ID" help={accountHelp}>
          <Input
            id={`${id}-account`}
            aria-describedby={`${id}-account-help`}
            autoComplete="off"
            spellCheck={false}
            disabled={acting}
            value={account}
            onChange={(event) => setAccount(event.target.value)}
          />
        </Field>
      )}
      <Field id={`${id}-key`} label={`API ${secret}`} help={keyHelp}>
        <Input
          id={`${id}-key`}
          type="password"
          aria-describedby={`${id}-key-help`}
          autoComplete="off"
          disabled={acting}
          value={key}
          onChange={(event) => setKey(event.target.value)}
        />
      </Field>
      {failure && (
        <p role="alert" className="text-xs text-destructive">
          {failure.code === 'invalid_config' ? `That ${secret} was rejected. ` : ''}
          {failure.message}.
        </p>
      )}
      <div className="grid gap-0.5 border-t pt-3">
        <Muted size="xs">{price}</Muted>
        <Muted size="xs">{privacy}</Muted>
      </div>
    </ActionDialog>
  );
}

/** One labelled field, with the help under it that its input names as its description. */
function Field(props: { id: string; label: string; help: ReactNode; children: ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label htmlFor={props.id}>{props.label}</Label>
      {props.children}
      <Muted size="xs" id={`${props.id}-help`}>
        {props.help}
      </Muted>
    </div>
  );
}
