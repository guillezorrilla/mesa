import type { BasesWritten, VaultInventory, VaultStatus } from '@mesa/core';
import { ExternalLink, FolderPlus, Settings2, Table2 } from 'lucide-react';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Muted } from '@/components/Muted';
import { PageHeader } from '@/components/PageHeader';
import { useToast, warned } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCall, useRun } from '@/lib/useCommand';
import { useVaultLook } from './useVaultLook';
import { VaultBrowser } from './VaultBrowser';
import { VaultEmpty, VaultNotLaidOut, VaultUnlisted } from './VaultState';

/** The listed vault's browser and Bases action share the existing remount boundary. */
function VaultContent(props: {
  inventory: VaultInventory;
  looks: number;
  status?: VaultStatus;
  query: string;
  path?: string;
  actions: ReactNode;
  setup: ReactNode;
}) {
  const { inventory, status } = props;
  const call = useCall();
  const toast = useToast();
  const [writing, setWriting] = useState(false);
  const [bases, setBases] = useState<BasesWritten>();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const writeBases = async () => {
    setWriting(true);
    const result = await call('vault.bases');
    if (!active.current) return;
    setWriting(false);
    if (result.ok) setBases(result.data);
    else {
      setBases(undefined);
      toast(result.error.message);
    }
  };
  return (
    <>
      <PageHeader
        title="Vault"
        description={`${inventory.total} ${inventory.total === 1 ? 'item' : 'items'} in ${inventory.vault}`}
      >
        {props.actions}
        <Button variant="outline" disabled={writing} onClick={() => void writeBases()}>
          <Table2 aria-hidden className="size-4" /> Write Bases views
        </Button>
      </PageHeader>
      {bases && (
        <Muted role="status">
          Bases: wrote {bases.written.length}, kept {bases.kept.length}.
        </Muted>
      )}
      {inventory.total === 0 ? (
        <VaultEmpty
          vault={inventory.vault}
          actions={status && !status.ok ? props.setup : undefined}
        />
      ) : (
        <>
          {status && !status.ok && <VaultNotLaidOut status={status} actions={props.setup} />}
          <VaultBrowser
            inventory={inventory}
            looks={props.looks}
            query={props.query}
            path={props.path}
          />
        </>
      )}
    </>
  );
}

/**
 * Every item in the active profile's vault (`mesa vault list`), kept current (useVaultLook), in
 * the browser; or why there are none, with the fix. The browser is the listed vault's: when the
 * profile's vault changes, its filters, search, selection and Bases feedback start over.
 */
export function VaultScreen({
  query = '',
  path,
  onSettings,
}: {
  query?: string;
  path?: string;
  onSettings?: () => void;
}) {
  const look = useVaultLook();
  const run = useRun();
  const { acting, act } = useAct();
  const setup = (
    <Button
      variant="outline"
      disabled={acting}
      onClick={() =>
        void act(async () => {
          if (!(await run('vault.init'))) return undefined;
          await look?.refresh();
          return undefined;
        })
      }
    >
      <FolderPlus aria-hidden /> Set up vault
    </Button>
  );
  const settings = onSettings && (
    <Button variant="ghost" onClick={onSettings}>
      <Settings2 aria-hidden /> Vault settings
    </Button>
  );
  const actions = (
    <>
      {settings}
      <Button
        data-testid="open-vault"
        variant="outline"
        disabled={acting || !look?.list.ok}
        onClick={() => void act(async () => warned((await run('vault.open'))?.warning))}
      >
        <ExternalLink aria-hidden /> Open in Obsidian
      </Button>
    </>
  );
  return (
    <section data-testid="vault-panel" className="space-y-4">
      {look?.list.ok ? (
        <VaultContent
          key={JSON.stringify([look.list.data.vault, query, path])}
          inventory={look.list.data}
          looks={look.count}
          status={look.status}
          query={query}
          path={path}
          actions={actions}
          setup={setup}
        />
      ) : (
        <>
          <PageHeader title="Vault" description="Every item in this profile's vault.">
            {actions}
            <Button variant="outline" disabled>
              <Table2 aria-hidden className="size-4" /> Write Bases views
            </Button>
          </PageHeader>
          {!look ? (
            <Muted>Reading the vault...</Muted>
          ) : !look.list.ok ? (
            <VaultUnlisted
              error={look.list.error}
              status={look.status}
              actions={
                <>
                  {look.list.error.code === 'not_found' && look.status && setup}
                  {settings}
                </>
              }
            />
          ) : null}
        </>
      )}
    </section>
  );
}
