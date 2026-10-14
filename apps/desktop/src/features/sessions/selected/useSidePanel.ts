import type { NativeResponse } from '@mesa/core';
import { useEffect, useState } from 'react';

export type SidePanel = 'review' | 'browser' | 'diff';

/** One session's open panel, with the reply or URL it was opened on. */
export type OpenPanel = {
  panel: SidePanel;
  reviewResponse?: NativeResponse;
  browserTarget?: { url: string };
};

/**
 * Which panel sits beside each session's terminal: Replies, Browser or Diff, one at a time per
 * session. A session keeps its panel while another is selected (SidePanels keeps it mounted,
 * hidden), so going back finds it as it was. A request from a terminal opens its panel once its
 * session is the one selected.
 */
export function useSidePanel(selectedSession: string | undefined) {
  const [panels, setPanels] = useState<Record<string, OpenPanel | undefined>>({});
  const [pendingReview, setPendingReview] = useState<NativeResponse>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  const put = (session: string, next: OpenPanel | undefined) =>
    setPanels((all) => ({ ...all, [session]: next }));
  useEffect(() => {
    if (!pendingReview || pendingReview.session !== selectedSession) return;
    const open = { panel: 'review' as const, reviewResponse: pendingReview };
    setPanels((all) => ({ ...all, [pendingReview.session]: open }));
    setPendingReview(undefined);
  }, [pendingReview, selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== selectedSession) return;
    const open = { panel: 'browser' as const, browserTarget: { url: pendingBrowser.url } };
    setPanels((all) => ({ ...all, [pendingBrowser.session]: open }));
    setPendingBrowser(undefined);
  }, [pendingBrowser, selectedSession]);
  return {
    /** The selected session's open panel. */
    open: selectedSession ? panels[selectedSession]?.panel : undefined,
    /** Every session's open panel, the selected one's included. */
    panels,
    /** Opens `panel` for the selected session in place of any other, or closes it when open. */
    toggle: (panel: SidePanel) => {
      if (selectedSession)
        put(selectedSession, panels[selectedSession]?.panel === panel ? undefined : { panel });
    },
    close: (session: string) => put(session, undefined),
    /** Opens Review on `response` once its session is selected. */
    requestReview: (response: NativeResponse) => setPendingReview(response),
    /** Opens Browser at `url` once `session` is selected. */
    requestBrowser: (session: string, url: string) => setPendingBrowser({ session, url }),
  };
}
