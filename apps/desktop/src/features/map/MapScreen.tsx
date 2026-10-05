import { MAP_PATH } from '@mesa/core/browser';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useVaultLook, useVaultRefresh, type VaultLook } from '@/features/vault/useVaultLook';
import { VaultUnlisted } from '@/features/vault/VaultState';
import { useCall, useOptional } from '@/lib/useCommand';
import { CanvasView } from './CanvasView';

function SavedMap(props: {
  looks: number;
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const read = useOptional('vault.read', { path: MAP_PATH });
  useVaultRefresh(props.looks, read.busy, read.refresh);
  if (read.error?.code === 'not_found') return <p role="status">No map yet. Use Update map.</p>;
  if (read.error) return <p role="status">Map unavailable: {read.error.message}</p>;
  if (!read.data) return <p role="status">Reading map...</p>;
  if (read.data.preview !== 'canvas' || !read.data.canvas) {
    return (
      <p role="status">
        Map unavailable:{' '}
        {read.data.preview === 'unsupported'
          ? read.data.reason
          : 'invalid Canvas geometry or references'}
      </p>
    );
  }
  if (!read.data.canvas.nodes.length) return <p role="status">No map yet. Use Update map.</p>;
  return (
    <CanvasView
      canvas={read.data.canvas}
      onSession={props.onSession}
      onVaultItem={props.onVaultItem}
    />
  );
}

/** The saved model and its actions share the listed vault's existing remount lifetime. */
function MapContent(props: {
  look: VaultLook;
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const { look } = props;
  const call = useCall();
  const toast = useToast();
  const [updating, setUpdating] = useState(false);
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const update = async () => {
    setUpdating(true);
    const result = await call('map.update', {});
    if (!active.current) return;
    if (result.ok) await look.refresh();
    else toast(result.error.message);
    if (active.current) setUpdating(false);
  };
  const open = async () => {
    const result = await call('vault.openNote', { note: MAP_PATH });
    if (active.current && !result.ok) toast(result.error.message);
  };
  return (
    <>
      <PageHeader
        title="Map"
        description="Saved projects and sessions. Update replaces personal map edits without recording history."
      >
        <Button disabled={updating} onClick={() => void update()}>
          {updating ? 'Updating...' : 'Update map'}
        </Button>
        <Button variant="outline" onClick={() => void open()}>
          Open in Obsidian
        </Button>
      </PageHeader>
      {look.list.ok && !look.list.data.items.some((item) => item.path === MAP_PATH) ? (
        <p role="status">No map yet. Use Update map.</p>
      ) : (
        <SavedMap looks={look.count} onSession={props.onSession} onVaultItem={props.onVaultItem} />
      )}
    </>
  );
}

/** Reads the saved map; regeneration is an explicit user action, never a screen mount or refresh. */
export function MapScreen(props: {
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const look = useVaultLook();
  return (
    <section data-testid="map-screen" className="space-y-4">
      {look?.list.ok ? (
        <MapContent key={look.list.data.vault} look={look} {...props} />
      ) : (
        <>
          <PageHeader
            title="Map"
            description="Saved projects and sessions. Update replaces personal map edits without recording history."
          >
            <Button disabled>Update map</Button>
            <Button variant="outline" disabled>
              Open in Obsidian
            </Button>
          </PageHeader>
          {!look ? (
            <p role="status">Reading vault...</p>
          ) : !look.list.ok ? (
            <VaultUnlisted error={look.list.error} status={look.status} />
          ) : null}
        </>
      )}
    </section>
  );
}
