import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';

/**
 * The page in a session's native browser: its address, the URL loaded, and the surface the
 * WKWebView is laid over, kept to its bounds until the panel closes. The native view sits over the
 * window, so a panel hidden while another session is selected (SidePanels) closes it, and opens
 * it again on the page it was on when shown. Every navigation clears the page selection first.
 */
export function useBrowserPage({
  sessionId,
  initialUrl,
  clearSelection,
  setError,
}: {
  sessionId: string;
  initialUrl?: { url: string };
  clearSelection: () => Promise<void>;
  setError: (error: string) => void;
}) {
  const platform = usePlatform();
  const surface = useRef<HTMLElement>(null);
  const [address, setAddress] = useState('');
  const [current, setCurrent] = useState('');
  const [opened, setOpened] = useState(false);
  const [busy, setBusy] = useState(false);
  const lastInitialUrl = useRef<typeof initialUrl>(undefined);
  const currentUrl = useRef('');
  currentUrl.current = current;
  // The page to open again once a hidden panel shows: set when hiding closed the native view.
  const reopenAt = useRef<string>(undefined);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void platform.browser
      .onLoad((event) => {
        if (event.session !== sessionId) return;
        setCurrent(event.url);
        setAddress(event.url);
        void clearSelection().catch((cause) => setError(String(cause)));
      })
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
      void clearSelection().catch(() => undefined);
    };
  }, [clearSelection, platform.browser, sessionId, setError]);

  useEffect(() => {
    if (!opened || !surface.current) return;
    const box = () => {
      const rect = surface.current?.getBoundingClientRect();
      return rect && { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
    };
    const url = reopenAt.current;
    const rect = box();
    reopenAt.current = undefined;
    if (url && rect)
      void platform.browser.open(sessionId, url, rect).catch((cause) => setError(String(cause)));
    const observer = new ResizeObserver(() => {
      const rect = box();
      if (rect) void platform.browser.bounds(sessionId, rect);
    });
    observer.observe(surface.current);
    return () => {
      observer.disconnect();
      void platform.browser.close(sessionId);
      reopenAt.current = currentUrl.current;
    };
  }, [opened, platform.browser, sessionId, setError]);

  const navigate = useCallback(
    async (url: string) => {
      const box = surface.current?.getBoundingClientRect();
      if (!box) return;
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
      setBusy(true);
      setError('');
      try {
        await clearSelection();
        if (opened) await platform.browser.navigate(sessionId, url);
        else {
          await platform.browser.open(sessionId, url, rect);
          setOpened(true);
        }
      } catch (cause) {
        setError(String(cause));
      } finally {
        setBusy(false);
      }
    },
    [clearSelection, opened, platform.browser, sessionId, setError],
  );
  useEffect(() => {
    if (initialUrl && initialUrl !== lastInitialUrl.current) {
      lastInitialUrl.current = initialUrl;
      setAddress(initialUrl.url);
      void navigate(initialUrl.url);
    }
  }, [initialUrl, navigate]);

  /** Clears the selection, then takes `step` (Back, Forward, Reload). */
  const afterClear = (step: () => Promise<void>) =>
    void clearSelection()
      .then(step)
      .catch((cause) => setError(String(cause)));
  return {
    surface,
    address,
    setAddress,
    current,
    busy,
    navigate,
    back: () => afterClear(() => platform.browser.back(sessionId)),
    forward: () => afterClear(() => platform.browser.forward(sessionId)),
    reload: () => afterClear(() => platform.browser.reload(sessionId)),
  };
}
