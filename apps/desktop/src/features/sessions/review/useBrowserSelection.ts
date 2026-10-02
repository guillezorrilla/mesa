import type { BrowserAnnotationPreview, GuardrailCheck } from '@mesa/core';
import { useCallback, useEffect, useRef, useState } from 'react';
import { usePlatform } from '@/lib/MesaRoot';
import type { BrowserProbe, BrowserSelection } from '@/lib/platform';
import { useCall } from '@/lib/useCommand';
import { queueSelection } from './selectionQueue';

/**
 * The browser page's selection: the page probed, the element picked and registered with Mesa, and
 * the annotation preview and guardrail ask on it. A pick the page no longer holds clears it all.
 */
export function useBrowserSelection(sessionId: string, setError: (error: string) => void) {
  const platform = usePlatform();
  const call = useCall();
  const [probe, setProbe] = useState<BrowserProbe>();
  const [picked, setPicked] = useState<BrowserSelection>();
  const [preview, setPreview] = useState<BrowserAnnotationPreview>();
  const [ask, setAsk] = useState<GuardrailCheck>();
  const [picking, setPicking] = useState(false);
  const selectionGeneration = useRef(0);
  const clearSelection = useCallback(async () => {
    selectionGeneration.current++;
    setProbe(undefined);
    setPicked(undefined);
    setPreview(undefined);
    setAsk(undefined);
    setPicking(false);
    const result = await queueSelection(sessionId, () => call('browser.clear', { id: sessionId }));
    if (!result.ok) throw new Error(result.error.message);
  }, [call, sessionId]);

  useEffect(() => {
    if (!picked) return;
    let active = true;
    let checking = false;
    const timer = window.setInterval(() => {
      if (checking) return;
      checking = true;
      void platform.browser
        .pickResult(sessionId)
        .catch(() => null)
        .then((fresh) => {
          if (active && JSON.stringify(fresh) !== JSON.stringify(picked)) return clearSelection();
        })
        .catch((cause) => {
          if (active) setError(String(cause));
        })
        .finally(() => {
          checking = false;
        });
    }, 500);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [clearSelection, picked, platform.browser, sessionId, setError]);

  const inspect = () =>
    void platform.browser
      .probe(sessionId)
      .then(setProbe)
      .catch((cause) => setError(String(cause)));
  const startPicking = () =>
    void clearSelection()
      .then(() => platform.browser.pickStart(sessionId))
      .then(() => {
        setPicking(true);
        setPicked(undefined);
      })
      .catch((cause) => setError(String(cause)));
  /** Registers the element clicked in the page as `profileName`'s selection, unless it was cleared meanwhile. */
  const takePicked = (profileName: string | undefined) => {
    const generation = selectionGeneration.current;
    void platform.browser
      .pickResult(sessionId)
      .then(async (result) => {
        if (result) {
          if (generation !== selectionGeneration.current) return;
          if (!profileName) throw new Error('Mesa profile is unavailable');
          const owner = await platform.browser.owner();
          if (generation !== selectionGeneration.current) return;
          const registered = await queueSelection(sessionId, () =>
            call('browser.select', {
              id: sessionId,
              profile: profileName,
              ownerPid: owner.pid,
              ownerSocket: owner.socket,
              ...result,
            }),
          );
          if (!registered.ok) throw new Error(registered.error.message);
          if (generation !== selectionGeneration.current) return;
          setPicked(result);
          setPreview(undefined);
          setAsk(undefined);
          setPicking(false);
        } else setError('Click an element in the page, then use this selection.');
      })
      .catch((cause) => setError(String(cause)));
  };
  return {
    probe,
    picked,
    setPicked,
    preview,
    setPreview,
    ask,
    setAsk,
    picking,
    clearSelection,
    inspect,
    startPicking,
    takePicked,
  };
}

/** What `useBrowserSelection` returns. */
export type BrowserSelectionState = ReturnType<typeof useBrowserSelection>;
