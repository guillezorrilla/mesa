import { localDay, validLocalDay } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRun } from '@/lib/useCommand';
import { useVaultLook } from '../vault/useVaultLook';
import { VaultReader } from '../vault/VaultReader';

/** Daily is a reader until the person explicitly rebuilds the selected local calendar day. */
export function DailyScreen({ onVaultItem }: { onVaultItem: (path: string) => void }) {
  const [date, setDate] = useState(() => localDay(new Date()));
  const [builds, setBuilds] = useState(0);
  const [busy, setBusy] = useState(false);
  const run = useRun();
  const look = useVaultLook();
  const valid = validLocalDay(date);
  return (
    <section className="min-w-0 space-y-4 p-4" aria-label="Daily">
      <h2 className="text-lg font-semibold">Daily</h2>
      <div className="flex items-end gap-3">
        <div className="grid gap-1">
          <Label htmlFor="daily-date">Date</Label>
          <Input
            id="daily-date"
            type="date"
            value={date}
            onInput={(event) => setDate(event.currentTarget.value)}
          />
        </div>
        <Button
          data-testid="daily-rebuild"
          disabled={busy || !valid}
          onClick={async () => {
            setBusy(true);
            try {
              if (await run('daily.build', { date })) setBuilds((n) => n + 1);
            } finally {
              setBusy(false);
            }
          }}
        >
          <RefreshCw aria-hidden /> Rebuild
        </Button>
      </div>
      {!valid ? (
        <p role="status">Choose a real local calendar date.</p>
      ) : look?.list.ok ? (
        <VaultReader
          key={`${look.list.data.vault}:${date}`}
          path={`daily/${date}.md`}
          looks={look.count + builds}
          onSelect={onVaultItem}
        />
      ) : (
        <p role="status">
          {look ? (look.list.ok ? '' : look.list.error.message) : 'Reading the vault...'}
        </p>
      )}
    </section>
  );
}
