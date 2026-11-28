import { FIXED_SHORTCUTS } from '@mesa/core/browser';
import { Maximize2, Minimize2, Radio } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { keyCaps } from '@/lib/shortcutKeys';

/** Live (new lines every 2 s, or paused) and Maximize (over the session area, Esc to return). */
export function LogsLayoutButtons(props: {
  live: boolean;
  maximized: boolean;
  onLive: (live: boolean) => void;
  onMaximize: () => void;
}) {
  const keys = keyCaps(FIXED_SHORTCUTS.maximizeLogs).join('');
  return (
    <>
      <IconButton
        label={props.live ? 'Live: new lines every 2 s (pause)' : 'Paused (go live)'}
        icon={Radio}
        active={props.live}
        onClick={() => props.onLive(!props.live)}
      />
      <IconButton
        label={
          props.maximized ? `Back beside the terminal (Esc, ${keys})` : `Maximize logs (${keys})`
        }
        icon={props.maximized ? Minimize2 : Maximize2}
        active={props.maximized}
        onClick={props.onMaximize}
      />
    </>
  );
}
