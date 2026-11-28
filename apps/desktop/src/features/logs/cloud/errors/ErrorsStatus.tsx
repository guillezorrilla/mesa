import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

/**
 * What Errors is doing while it reads: the step, the projects and env it reads, the seconds so far,
 * and Cancel, which stops waiting and keeps what was shown.
 */
export function ErrorsStatus(props: { what: string; onCancel: () => void }) {
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    const started = Date.now();
    const tick = setInterval(() => setSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(tick);
  }, []);
  return (
    <div role="status" className="flex items-center gap-2 text-xs text-muted-foreground">
      <span aria-hidden className="size-1.5 animate-pulse rounded-full bg-state-working" />
      <span>
        {props.what}, {seconds} s
      </span>
      <Button size="xs" variant="ghost" className="ml-auto" onClick={props.onCancel}>
        <X aria-hidden /> Cancel
      </Button>
    </div>
  );
}
