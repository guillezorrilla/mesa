import type { NativeResponse } from '@mesa/core';
import { useEffect, useState } from 'react';

/**
 * Which panel sits beside the selected session's terminal: Review or Browser, one at a time, both
 * closed when the selection changes. A request from a terminal opens its panel once its session is
 * the one selected.
 */
export function useSidePanel(selectedSession: string | undefined) {
  const [reviewOpen, setReviewOpen] = useState(false);
  // The response a terminal's Review picked, preselected when the review opens.
  const [reviewResponse, setReviewResponse] = useState<NativeResponse>();
  const [pendingReview, setPendingReview] = useState<NativeResponse>();
  const [browserOpen, setBrowserOpen] = useState(false);
  const [browserTarget, setBrowserTarget] = useState<{ url: string }>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new selection closes both panels.
  useEffect(() => {
    setReviewOpen(false);
    setBrowserOpen(false);
    setBrowserTarget(undefined);
  }, [selectedSession]);
  useEffect(() => {
    if (!pendingReview || pendingReview.session !== selectedSession) return;
    setReviewResponse(pendingReview);
    setReviewOpen(true);
    setBrowserOpen(false);
    setPendingReview(undefined);
  }, [pendingReview, selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== selectedSession) return;
    setBrowserTarget({ url: pendingBrowser.url });
    setBrowserOpen(true);
    setReviewOpen(false);
    setPendingBrowser(undefined);
  }, [pendingBrowser, selectedSession]);
  return {
    reviewOpen,
    reviewResponse,
    browserOpen,
    browserTarget,
    toggleReview: () => {
      setBrowserOpen(false);
      setReviewResponse(undefined);
      setReviewOpen((open) => !open);
    },
    toggleBrowser: () => {
      setReviewOpen(false);
      setBrowserTarget(undefined);
      setBrowserOpen((open) => !open);
    },
    closeBrowser: () => {
      setBrowserTarget(undefined);
      setBrowserOpen(false);
    },
    /** Opens Review on `response` once its session is selected. */
    requestReview: (response: NativeResponse) => setPendingReview(response),
    /** Opens Browser at `url` once `session` is selected. */
    requestBrowser: (session: string, url: string) => setPendingBrowser({ session, url }),
  };
}
