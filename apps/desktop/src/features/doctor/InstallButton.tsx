import type { Check } from '@mesa/core';
import { Copy, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall, useRun } from '@/lib/useCommand';

/**
 * Installs a missing tmux or agent with Homebrew, then reruns the doctor so the row turns ok.
 * Without Homebrew it says so, with brew.sh and the command to copy once Homebrew is there.
 */
export function InstallButton(props: {
  check: Check & { install: string };
  onInstalled: () => Promise<void>;
}) {
  const { check } = props;
  const call = useCall();
  const run = useRun();
  const toast = useToast();
  const { clipboard } = usePlatform();
  const [state, setState] = useState<'idle' | 'installing' | 'no-brew'>('idle');
  const install = async () => {
    setState('installing');
    const result = await call('doctor.install', { name: check.name });
    if (result.ok) {
      await props.onInstalled();
      return setState('idle');
    }
    setState(result.error.code === 'not_found' ? 'no-brew' : 'idle');
    if (result.error.code !== 'not_found') toast(result.error.message);
  };
  if (state === 'no-brew')
    return (
      <div data-testid="install-no-brew" className="flex flex-wrap items-center gap-2">
        <span>Homebrew is required.</span>
        <Button
          variant="link"
          size="sm"
          className="h-auto p-0"
          onClick={() => void run('browser.external', { url: 'https://brew.sh' })}
        >
          brew.sh
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={async () => {
            await clipboard.write(check.install);
            toast('Command copied', 'confirmation');
          }}
        >
          <Copy aria-hidden /> Copy {check.install}
        </Button>
      </div>
    );
  return (
    <Button
      size="sm"
      data-testid="install-button"
      disabled={state === 'installing'}
      onClick={() => void install()}
    >
      {state === 'installing' ? (
        <Loader2 aria-hidden className="animate-spin" />
      ) : (
        <Download aria-hidden />
      )}
      {state === 'installing' ? 'Installing...' : `Install ${check.name}`}
    </Button>
  );
}
