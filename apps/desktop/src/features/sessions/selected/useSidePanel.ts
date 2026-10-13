import type { NativeResponse } from '@mesa/core';
import { useEffect, useState } from 'react';

export type SidePanel = 'review' | 'browser' | 'diff';

/**
 * Which panel sits beside the selected session's terminal: Replies, Browser or Diff, one at a time,
 * none when the selection changes. A request from a terminal opens its panel once its session is
 * the one selected.
 */
export function useSidePanel(selectedSession: string | undefined) {
  const [open, setOpen] = useState<SidePanel>();
  // The reply a terminal's Replies picked, opened when the pane opens.
  const [reviewResponse, setReviewResponse] = useState<NativeResponse>();
  const [pendingReview, setPendingReview] = useState<NativeResponse>();
  const [browserTarget, setBrowserTarget] = useState<{ url: string }>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new selection closes the panel.
  useEffect(() => {
    setOpen(undefined);
    setBrowserTarget(undefined);
  }, [selectedSession]);
  useEffect(() => {
    if (!pendingReview || pendingReview.session !== selectedSession) return;
    setReviewResponse(pendingReview);
    setOpen('review');
    setPendingReview(undefined);
  }, [pendingReview, selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== selectedSession) return;
    setBrowserTarget({ url: pendingBrowser.url });
    setOpen('browser');
    setPendingBrowser(undefined);
  }, [pendingBrowser, selectedSession]);
  return {
    open,
    reviewResponse,
    browserTarget,
    /** Opens `panel` in place of any other, or closes it when it is the one open. */
    toggle: (panel: SidePanel) => {
      setReviewResponse(undefined);
      setBrowserTarget(undefined);
      setOpen((last) => (last === panel ? undefined : panel));
    },
    close: () => {
      setBrowserTarget(undefined);
      setOpen(undefined);
    },
    /** Opens Review on `response` once its session is selected. */
    requestReview: (response: NativeResponse) => setPendingReview(response),
    /** Opens Browser at `url` once `session` is selected. */
    requestBrowser: (session: string, url: string) => setPendingBrowser({ session, url }),
  };
}
