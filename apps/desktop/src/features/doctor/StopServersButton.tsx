import { Loader2, Square } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { useRun } from '@/lib/useCommand';

/**
 * Stops the tmux servers of profiles that no longer exist (`mesa doctor --fix`), says how many,
 * then reruns the doctor so the row turns ok.
 */
export function StopServersButton(props: { onStopped: () => Promise<void> }) {
  const run = useRun();
  const toast = useToast();
  const [stopping, setStopping] = useState(false);
  const stop = async () => {
    setStopping(true);
    try {
      const result = await run('doctor.fix');
      if (result) toast(`Stopped ${result.stopped.length} tmux server(s)`, 'confirmation');
      await props.onStopped();
    } finally {
      setStopping(false);
    }
  };
  return (
    <Button
      type="button"
      size="sm"
      variant="secondary"
      data-testid="stop-servers"
      disabled={stopping}
      onClick={() => void stop()}
    >
      {stopping ? <Loader2 aria-hidden className="animate-spin" /> : <Square aria-hidden />}
      {stopping ? 'Stopping...' : 'Stop them'}
    </Button>
  );
}
