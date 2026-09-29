import type { InboxItem } from '@mesa/core';
import { RefreshCw } from 'lucide-react';
import { PageHeader } from '@/components/PageHeader';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { useCommand, useRun } from '@/lib/useCommand';

export function InboxScreen({ onSession }: { onSession: (id: string) => void }) {
  const inbox = useCommand('notifications.list');
  const run = useRun();
  const change = async (name: 'notifications.read' | 'notifications.clear', item: InboxItem) => {
    const result = await run(name, { id: item.id });
    if (result) await inbox.refresh();
  };
  const unread = inbox.data?.filter((item) => !item.read).length ?? 0;
  return (
    <section data-testid="inbox-panel" className="space-y-4">
      <PageHeader title="Inbox" description={`${unread} unread notices from your sessions`}>
        <Button variant="outline" onClick={() => void inbox.refresh()} disabled={inbox.busy}>
          <RefreshCw aria-hidden className={inbox.busy ? 'animate-spin' : undefined} />
          Refresh
        </Button>
      </PageHeader>
      {inbox.data?.map((item) => (
        <Card key={item.id} className="gap-2 p-4" data-testid="inbox-item">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div>
              <p className="font-medium">{item.title}</p>
              <p className="text-muted-foreground text-xs">
                {item.session} · {new Date(item.at).toLocaleString()} ·{' '}
                {item.read ? 'Read' : 'Unread'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => {
                  if (!item.read) void run('notifications.read', { id: item.id });
                  onSession(item.target.id);
                }}
              >
                Open session
              </Button>
              {!item.read && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void change('notifications.read', item)}
                >
                  Mark read
                </Button>
              )}
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void change('notifications.clear', item)}
              >
                Clear
              </Button>
            </div>
          </div>
        </Card>
      ))}
      {inbox.data?.length === 0 && (
        <p className="text-muted-foreground text-sm">No session notices yet.</p>
      )}
    </section>
  );
}
