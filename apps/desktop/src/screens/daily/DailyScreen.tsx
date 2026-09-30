import { localDay, validLocalDay } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCall } from '@/lib/useCommand';
import { useVaultLook, type VaultLook } from '../vault/useVaultLook';
import { VaultReader } from '../vault/VaultReader';

function DailyControls(props: {
  date: string;
  onDate: (date: string) => void;
  busy?: boolean;
  rebuild?: () => Promise<void>;
}) {
  return (
    <div className="flex items-end gap-3">
      <div className="grid gap-1">
        <Label htmlFor="daily-date">Date</Label>
        <Input
          id="daily-date"
          type="date"
          value={props.date}
          onInput={(event) => props.onDate(event.currentTarget.value)}
        />
      </div>
      <Button
        data-testid="daily-rebuild"
        disabled={props.busy || !props.rebuild}
        onClick={() => void props.rebuild?.()}
      >
        <RefreshCw aria-hidden /> Rebuild
      </Button>
    </div>
  );
}

/** The reader and rebuild replies belong to this listed vault and selected date. */
function DailyContent(props: {
  date: string;
  onDate: (date: string) => void;
  look: VaultLook;
  onVaultItem: (path: string) => void;
}) {
  const [builds, setBuilds] = useState(0);
  const [busy, setBusy] = useState(false);
  const call = useCall();
  const toast = useToast();
  const active = useRef(true);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
    };
  }, []);
  const rebuild = async () => {
    setBusy(true);
    const result = await call('daily.build', { date: props.date });
    if (!active.current) return;
    setBusy(false);
    if (result.ok) setBuilds((n) => n + 1);
    else toast(result.error.message);
  };
  return (
    <>
      <DailyControls date={props.date} onDate={props.onDate} busy={busy} rebuild={rebuild} />
      <VaultReader
        path={`daily/${props.date}.md`}
        looks={props.look.count + builds}
        onSelect={props.onVaultItem}
      />
    </>
  );
}

/** Daily is a reader until the person explicitly rebuilds the selected local calendar day. */
export function DailyScreen({ onVaultItem }: { onVaultItem: (path: string) => void }) {
  const [date, setDate] = useState(() => localDay(new Date()));
  const look = useVaultLook();
  const valid = validLocalDay(date);
  return (
    <section className="min-w-0 space-y-4 p-4" aria-label="Daily">
      <h2 className="text-lg font-semibold">Daily</h2>
      {valid && look?.list.ok ? (
        <DailyContent
          key={JSON.stringify([look.list.data.vault, date])}
          date={date}
          onDate={setDate}
          look={look}
          onVaultItem={onVaultItem}
        />
      ) : (
        <>
          <DailyControls date={date} onDate={setDate} />
          <p role="status">
            {!valid
              ? 'Choose a real local calendar date.'
              : look
                ? look.list.ok
                  ? ''
                  : look.list.error.message
                : 'Reading the vault...'}
          </p>
        </>
      )}
    </section>
  );
}
