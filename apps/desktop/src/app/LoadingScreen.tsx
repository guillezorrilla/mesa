import { Loader2 } from 'lucide-react';
import mesaLogo from '../../src-tauri/icons/128x128.png';

/** The window until the first view is chosen: the Mesa mark and a spinner on the app background. */
export function LoadingScreen() {
  return (
    <div
      role="status"
      aria-label="Loading Mesa"
      data-testid="loading-screen"
      data-tauri-drag-region="deep"
      className="flex h-screen select-none flex-col items-center justify-center gap-4 bg-background"
    >
      <img src={mesaLogo} alt="" aria-hidden className="size-20 object-contain" />
      <Loader2 aria-hidden className="size-5 animate-spin text-muted-foreground" />
    </div>
  );
}
