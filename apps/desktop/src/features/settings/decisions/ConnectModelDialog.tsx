import type { SystemOneProvider } from '@mesa/core/browser';
import { type ReactNode, useId, useState } from 'react';
import { ActionDialog } from '@/components/ActionDialog';
import { Muted } from '@/components/Muted';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';
import { MODELS } from './models';

type Failure = { code: string; message: string };

/**
 * Connects a hosted model: for CLEF its Cloudflare account ID, then its key, each labelled with
 * where to find it, over one line on price and one on privacy. Connect tests the key with one call
 * and saves it (`decisions.keys.set`, the key on stdin) and closes; a refused key says so in
 * place. The key field is empty again once sent, whatever the test said.
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
  const id = useId();
  const needsAccount = accountHelp !== undefined;
  const connect = () =>
    void act(async () => {
      const typed = key;
      setKey('');
      const saved = await call('decisions.keys.set', {
        provider,
        key: typed,
        ...(needsAccount ? { account: account.trim() } : {}),
      });
      if (!saved.ok) {
        setFailure(saved.error);
        return undefined;
      }
      await props.onConnected();
      props.onClose();
      return undefined;
    });
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
