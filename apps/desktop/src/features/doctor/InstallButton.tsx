import { Copy, Download, Loader2 } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { usePlatform } from '@/lib/MesaRoot';
import { useCall, useRun } from '@/lib/useCommand';

/** Homebrew's installer, as brew.sh gives it: it asks for the password itself, so Mesa never runs it. */
const HOMEBREW_INSTALL =
  '/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"';

/**
 * Installs a missing tmux or agent with Homebrew, then reruns the doctor so the row turns ok.
 * Without Homebrew it says so, with brew.sh and Homebrew's own installer to copy into a terminal.
 */
export function InstallButton(props: { name: string; onInstalled: () => Promise<void> }) {
  const call = useCall();
  const run = useRun();
  const toast = useToast();
  const { clipboard } = usePlatform();
  const [state, setState] = useState<'idle' | 'installing' | 'no-brew'>('idle');
  const install = async () => {
    setState('installing');
    const result = await call('doctor.install', { name: props.name });
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
            await clipboard.write(HOMEBREW_INSTALL);
            toast('Command copied', 'confirmation');
          }}
        >
          <Copy aria-hidden /> Copy Homebrew's installer
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
      {state === 'installing' ? 'Installing...' : `Install ${props.name}`}
    </Button>
  );
}
