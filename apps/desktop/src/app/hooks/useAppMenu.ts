import { useEffect } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { WorkspaceView } from '../navigation';

/** Opens the screens the macOS app menu names (About Mesa) through `navigate`, which must be stable. */
export function useAppMenu(navigate: (view: WorkspaceView) => void) {
  const { menu } = usePlatform();
  useEffect(() => {
    let stop: (() => void) | undefined;
    let active = true;
    void menu
      .onAbout(() => navigate({ kind: 'about' }))
      .then((unlisten) => {
        if (active) stop = unlisten;
        else unlisten();
      });
    return () => {
      active = false;
      stop?.();
    };
  }, [menu, navigate]);
}
