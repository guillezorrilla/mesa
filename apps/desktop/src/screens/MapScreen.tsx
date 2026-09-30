import { MAP_PATH, mapGroups } from '@mesa/core/browser';
import { useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCommand, useRun } from '@/lib/useCommand';
import { useVaultLook, useVaultRefresh } from './vault/useVaultLook';
import { VaultUnlisted } from './vault/VaultState';

function SavedMap(props: {
  looks: number;
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const read = useCommand('vault.read', { path: MAP_PATH });
  useVaultRefresh(props.looks, read.busy, read.refresh);
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
  const groups = mapGroups(read.data.canvas);
  if (!groups.length) return <p role="status">No sessions in the saved map.</p>;
  return (
    <div className="grid gap-4">
      {groups.map((group) => (
        <Card key={group.project} className="p-4">
          <h2 className="font-medium">{group.label}</h2>
          <ul className="space-y-2">
            {group.sessions.map((session) => (
              <li key={session.id} className="flex flex-wrap gap-2">
                <Button variant="link" onClick={() => props.onSession(session.id)}>
                  {session.label}
                </Button>
                {session.summary && (
                  <Button
                    variant="outline"
                    onClick={() => props.onVaultItem(session.summary ?? '')}
                  >
                    Open summary {session.id}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  );
}

/** Reads the saved map; regeneration is an explicit user action, never a screen mount or refresh. */
export function MapScreen(props: {
  onSession: (id: string) => void;
  onVaultItem: (path: string) => void;
}) {
  const look = useVaultLook();
  const run = useRun();
  const [updating, setUpdating] = useState(false);
  const update = async () => {
    setUpdating(true);
    try {
      if (await run('map.update', {})) await look?.refresh();
    } finally {
      setUpdating(false);
    }
  };
  return (
    <section data-testid="map-screen" className="space-y-4">
      <PageHeader
        title="Map"
        description="Saved projects and sessions. Update replaces personal map edits without recording history."
      >
        <Button disabled={updating} onClick={() => void update()}>
          {updating ? 'Updating...' : 'Update map'}
        </Button>
        <Button variant="outline" onClick={() => void run('vault.openNote', { note: MAP_PATH })}>
          Open in Obsidian
        </Button>
      </PageHeader>
      {!look ? (
        <p role="status">Reading vault...</p>
      ) : !look.list.ok ? (
        <VaultUnlisted error={look.list.error} status={look.status} />
      ) : !look.list.data.items.some((item) => item.path === MAP_PATH) ? (
        <p role="status">No map yet. Use Update map.</p>
      ) : (
        <SavedMap key={look.list.data.vault} looks={look.count} {...props} />
      )}
    </section>
  );
}
