import type { KeyRow } from '@mesa/core';
import { DECISION_SITES, localDay, PASSED_GATE, type SystemOneProvider } from '@mesa/core/browser';
import { KeyRound, ListChecks, ReceiptText, Shield } from 'lucide-react';
import { useId, useState } from 'react';
import { ExternalLink } from '@/components/ExternalLink';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useAct } from '@/lib/useAct';
import { useCall } from '@/lib/useCommand';
import { SettingRow } from '../SettingRow';
import { SettingSection } from '../SettingSection';
import { MODELS, SITE_LABELS, TYPESAFE_CONSOLE } from './models';

type Failure = { code: string; message: string };

/**
 * One hosted model's card: what it improves, how to get its key, its price and privacy, and the
 * key: a password field with Test and save, or once set only its last 4 with Replace, Remove and
 * Use this one; then each decision site, active only where the model passed the quality check.
 */
export function ModelKeyPanel(props: {
  model: SystemOneProvider;
  row: KeyRow | undefined;
  inUse: boolean;
  /** The Cloudflare account ID config.yaml keeps, for CLEF. */
  account: string | undefined;
  onChanged: () => Promise<void>;
}) {
  const { label, provider, keyLabel, sentence, steps, price, privacy } = MODELS[props.model];
  const call = useCall();
  const { acting, act } = useAct();
  const [key, setKey] = useState('');
  const [account, setAccount] = useState(props.account ?? '');
  const [replacing, setReplacing] = useState(false);
  const [failure, setFailure] = useState<Failure>();
  const id = useId();
  const clef = props.model === 'clef';
  const run = (action: () => Promise<{ ok: boolean; error?: Failure }>) =>
    void act(async () => {
      const result = await action();
      setFailure(result.ok ? undefined : result.error);
      if (result.ok) await props.onChanged();
      return undefined;
    });
  const testAndSave = () =>
    run(async () => {
      const typed = key;
      // The field never keeps a key once it was sent, whatever the test said.
      setKey('');
      const saved = await call('decisions.keys.set', {
        provider,
        key: typed,
        ...(clef && account.trim() ? { account: account.trim() } : {}),
      });
      if (saved.ok) setReplacing(false);
      return saved;
    });
  const editing = !props.row?.set || replacing;
  return (
    <SettingSection id={props.model} title={label} description={sentence}>
      <SettingRow
        icon={ListChecks}
        title="Set up"
        keywords={`${provider} key token`}
        description={
          <ol className="list-decimal space-y-0.5 pl-4">
            {steps.map((step, at) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: the steps are fixed and in order.
              <li key={at}>{step}</li>
            ))}
          </ol>
        }
      />
      <SettingRow icon={ReceiptText} title="Price" description={price} />
      <SettingRow icon={Shield} title="Privacy" description={privacy} />
      <SettingRow
        icon={KeyRound}
        title={keyLabel}
        htmlFor={editing ? `${id}-key` : undefined}
        description={
          props.row?.set && !replacing
            ? `Set, ending in ${props.row.last4}${props.row.addedAt ? `, added ${localDay(new Date(props.row.addedAt))}` : ''}`
            : 'Kept only in the macOS Keychain, and shown only by its last 4 characters.'
        }
        control={
          props.row?.set && !replacing ? (
            <span className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                disabled={acting}
                onClick={() => setReplacing(true)}
              >
                Replace
              </Button>
              <Button
                size="sm"
                variant="ghost"
                disabled={acting}
                onClick={() => run(() => call('decisions.keys.remove', { provider }))}
              >
                Remove
              </Button>
              {props.inUse ? (
                <Badge variant="secondary">In use</Badge>
              ) : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={acting}
                  onClick={() => run(() => call('decisions.use', { model: props.model }))}
                >
                  Use this one
                </Button>
              )}
            </span>
          ) : undefined
        }
      >
        {editing && (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              testAndSave();
            }}
          >
            {clef && (
              <Input
                aria-label="Cloudflare account ID"
                placeholder="Account ID"
                className="w-56 text-xs"
                value={account}
                onChange={(event) => setAccount(event.target.value)}
              />
            )}
            <Input
              id={`${id}-key`}
              type="password"
              autoComplete="off"
              aria-label={keyLabel}
              placeholder={keyLabel}
              className="w-72 text-xs"
              value={key}
              onChange={(event) => setKey(event.target.value)}
            />
            <Button
              size="sm"
              type="submit"
              disabled={acting || !key.trim() || (clef && !account.trim())}
            >
              {acting ? 'Testing...' : 'Test and save'}
            </Button>
            {replacing && (
              <Button size="sm" variant="ghost" type="button" onClick={() => setReplacing(false)}>
                Cancel
              </Button>
            )}
          </form>
        )}
        {failure && <KeyFailure failure={failure} jev={props.model === 'jev'} />}
      </SettingRow>
      <SettingRow
        icon={ListChecks}
        title="Decision sites"
        keywords="quality check"
        description={
          <ul data-testid={`${props.model}-sites`}>
            {DECISION_SITES.map((site) => (
              <li key={site}>
                {SITE_LABELS[site]}:{' '}
                {PASSED_GATE[props.model].includes(site)
                  ? 'active'
                  : 'not active: did not pass the quality check'}
              </li>
            ))}
          </ul>
        }
      />
    </SettingSection>
  );
}

/** Why a key was not saved: "Key rejected" for a refused key, TypeSafe's console for Jev. */
function KeyFailure(props: { failure: Failure; jev: boolean }) {
  // A refused key is invalid_config (HTTP 401 or 403); the rest is a usage or service problem.
  const rejected = props.failure.code === 'invalid_config';
  return (
    <Muted size="xs" role="alert" className="mt-2 text-destructive">
      {rejected ? 'Key rejected. ' : ''}
      {props.failure.message}.
      {props.jev && (
        <>
          {' '}
          Check the key and your TypeSafe sign-up at{' '}
          <ExternalLink href={TYPESAFE_CONSOLE}>console.typesafe.ai/keys</ExternalLink>.
        </>
      )}
    </Muted>
  );
}
