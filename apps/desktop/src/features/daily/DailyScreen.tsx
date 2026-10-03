import { localDay, validLocalDay } from '@mesa/core/browser';
import { RefreshCw } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { PageHeader } from '@/components/PageHeader';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useVaultLook, type VaultLook } from '@/features/vault/useVaultLook';
import { VaultReader } from '@/features/vault/VaultReader';
import { useCall } from '@/lib/useCommand';

function DailyControls(props: {
  date: string;
  onDate: (date: string) => void;
  busy?: boolean;
  rebuild?: () => Promise<void>;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2 border-b px-3 py-2">
      <Input
        id="daily-date"
        type="date"
        aria-label="Date"
        className="h-8 w-40 bg-background dark:bg-background"
        value={props.date}
        onInput={(event) => props.onDate(event.currentTarget.value)}
      />
      <Button
        data-testid="daily-rebuild"
        variant="outline"
        size="sm"
        className="ml-auto"
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
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        <VaultReader
          path={`daily/${props.date}.md`}
          looks={props.look.count + builds}
          onSelect={props.onVaultItem}
        />
      </div>
    </>
  );
}

/** Daily is a reader until the person explicitly rebuilds the selected local calendar day. */
export function DailyScreen({ onVaultItem }: { onVaultItem: (path: string) => void }) {
  const [date, setDate] = useState(() => localDay(new Date()));
  const look = useVaultLook();
  const valid = validLocalDay(date);
  return (
    <section className="min-w-0" aria-label="Daily">
      <PageHeader
        title="Daily"
        description="One note per day from the vault: sessions, decisions, next steps."
      />
      <div className="flex h-[calc(100vh-10rem)] min-h-[30rem] flex-col overflow-hidden rounded-lg border bg-card/40">
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
            <p role="status" className="p-5 text-sm text-muted-foreground">
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
      </div>
    </section>
  );
}
