import type { NativeResponse } from '@mesa/core';
import { useEffect, useState } from 'react';

export type SidePanel = 'review' | 'browser' | 'diff';

/**
 * Which panel sits beside the selected session's terminal: Replies, Browser or Diff, one at a time,
 * remembered per session while the app runs, so going back to a session reopens its panel. A
 * request from a terminal opens its panel once its session is the one selected.
 */
export function useSidePanel(selectedSession: string | undefined) {
  const [openBy, setOpenBy] = useState<Record<string, SidePanel | undefined>>({});
  const open = selectedSession ? openBy[selectedSession] : undefined;
  const setOpen = (next: (last: SidePanel | undefined) => SidePanel | undefined) => {
    if (selectedSession)
      setOpenBy((all) => ({ ...all, [selectedSession]: next(all[selectedSession]) }));
  };
  // The reply a terminal's Replies picked, opened when the pane opens.
  const [reviewResponse, setReviewResponse] = useState<NativeResponse>();
  const [pendingReview, setPendingReview] = useState<NativeResponse>();
  const [browserTarget, setBrowserTarget] = useState<{ url: string }>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  // biome-ignore lint/correctness/useExhaustiveDependencies: a reply or URL belongs to the last session.
  useEffect(() => {
    setReviewResponse(undefined);
    setBrowserTarget(undefined);
  }, [selectedSession]);
  useEffect(() => {
    if (!pendingReview || pendingReview.session !== selectedSession) return;
    setReviewResponse(pendingReview);
    setOpenBy((all) => ({ ...all, [pendingReview.session]: 'review' }));
    setPendingReview(undefined);
  }, [pendingReview, selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== selectedSession) return;
    setBrowserTarget({ url: pendingBrowser.url });
    setOpenBy((all) => ({ ...all, [pendingBrowser.session]: 'browser' }));
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
      setOpen(() => undefined);
    },
    /** Opens Review on `response` once its session is selected. */
    requestReview: (response: NativeResponse) => setPendingReview(response),
    /** Opens Browser at `url` once `session` is selected. */
    requestBrowser: (session: string, url: string) => setPendingBrowser({ session, url }),
  };
}
