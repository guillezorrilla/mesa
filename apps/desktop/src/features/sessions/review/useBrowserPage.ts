import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { BrowserBounds } from '@/lib/platform';

/** Where the native view goes: the surface's box in the window. */
function surfaceRect(element: HTMLElement | null): BrowserBounds | undefined {
  const box = element?.getBoundingClientRect();
  return box && { x: box.x, y: box.y, width: box.width, height: box.height };
}

/**
 * The page in a session's native browser: its address, the URL loaded, and the surface the
 * WKWebView is laid over, kept to its bounds. The native view sits over the window, so while the
 * panel is hidden (SidePanels hides it when another session is selected) the view is hidden too,
 * and shown again as it was: same page, history and scroll. It is closed only when the panel
 * really goes: unmounted (closed, switched to another panel, its session gone, the screen gone),
 * which removes the surface from the document, or moved to another session. Every navigation
 * clears the page selection first.
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
  // The session whose native view this panel owns, to close it when the panel moves on.
  const viewSession = useRef<string>(undefined);

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

  // Shown with the panel, at the surface's bounds; hidden with it, the page kept loaded.
  useEffect(() => {
    const element = surface.current;
    if (!opened || !element) return;
    const fit = () => {
      const rect = surfaceRect(element);
      if (rect) void platform.browser.bounds(sessionId, rect);
    };
    fit();
    void platform.browser.show(sessionId).catch((cause) => setError(String(cause)));
    const observer = new ResizeObserver(fit);
    observer.observe(element);
    return () => {
      observer.disconnect();
      void platform.browser.hide(sessionId).catch(() => undefined);
    };
  }, [opened, platform.browser, sessionId, setError]);

  // React gives a cleanup no sign of why it runs. Activity hides a panel by keeping its DOM in
  // the document, so a surface still connected means hidden (the effect above hides the view);
  // a detached one means unmounted. Close runs even before the view opened: it queues after an
  // open still in flight, and closing no view is a no-op.
  useEffect(() => {
    const element = surface.current;
    const previous = viewSession.current;
    if (previous && previous !== sessionId)
      void platform.browser.close(previous).catch(() => undefined);
    viewSession.current = sessionId;
    return () => {
      if (!element?.isConnected) void platform.browser.close(sessionId).catch(() => undefined);
    };
  }, [platform.browser, sessionId]);

  const navigate = useCallback(
    async (url: string) => {
      const rect = surfaceRect(surface.current);
      if (!rect) return;
      setBusy(true);
      setError('');
      try {
        await clearSelection();
        if (opened) await platform.browser.navigate(sessionId, url);
        else {
          await platform.browser.open(sessionId, url, rect);
          // Hidden while it opened (another session selected): the visibility effect shows it later.
          if (surface.current && !surface.current.checkVisibility())
            await platform.browser.hide(sessionId);
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
