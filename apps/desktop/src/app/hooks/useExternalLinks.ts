import { useEffect } from 'react';
import { useRun } from '@/lib/useCommand';

/**
 * Opens a clicked web link to another site in the default browser: the app's web view drops a
 * `target="_blank"` link and would navigate away from the app on a plain one.
 */
export function useExternalLinks() {
  const run = useRun();
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const link = (event.target as Element | null)?.closest?.('a[href]');
      if (!(link instanceof HTMLAnchorElement) || event.defaultPrevented) return;
      const url = new URL(link.href, location.href);
      if (!/^https?:$/.test(url.protocol) || url.origin === location.origin) return;
      event.preventDefault();
      void run('browser.external', { url: url.href });
    };
    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [run]);
}
