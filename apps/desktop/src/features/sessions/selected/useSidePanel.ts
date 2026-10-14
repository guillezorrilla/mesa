import type { NativeResponse } from '@mesa/core';
import { useEffect, useState } from 'react';

export type SidePanel = 'review' | 'browser' | 'diff';

/** One session's open panel, with the reply or URL it was opened on. */
export type OpenPanel = {
  panel: SidePanel;
  reviewResponse?: NativeResponse;
  browserTarget?: { url: string };
};

type Panels = Record<string, OpenPanel | undefined>;
/** `session`'s panel set to `open`, every other session's kept. */
const withPanel = (session: string, open: OpenPanel | undefined) => (all: Panels) => ({
  ...all,
  [session]: open,
});

/**
 * Which panel sits beside each session's terminal: Replies, Browser or Diff, one at a time per
 * session. A session keeps its panel while another is selected (SidePanels keeps it mounted,
 * hidden), so going back finds it as it was. A request from a terminal opens its panel once its
 * session is the one selected.
 */
export function useSidePanel(selectedSession: string | undefined) {
  const [panels, setPanels] = useState<Panels>({});
  const [pendingReview, setPendingReview] = useState<NativeResponse>();
  const [pendingBrowser, setPendingBrowser] = useState<{ session: string; url: string }>();
  useEffect(() => {
    if (!pendingReview || pendingReview.session !== selectedSession) return;
    setPanels(withPanel(pendingReview.session, { panel: 'review', reviewResponse: pendingReview }));
    setPendingReview(undefined);
  }, [pendingReview, selectedSession]);
  useEffect(() => {
    if (!pendingBrowser || pendingBrowser.session !== selectedSession) return;
    const browserTarget = { url: pendingBrowser.url };
    setPanels(withPanel(pendingBrowser.session, { panel: 'browser', browserTarget }));
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
        setPanels(
          withPanel(
            selectedSession,
            panels[selectedSession]?.panel === panel ? undefined : { panel },
          ),
        );
    },
    close: (session: string) => setPanels(withPanel(session, undefined)),
    /** Opens Review on `response` once its session is selected. */
    requestReview: (response: NativeResponse) => setPendingReview(response),
    /** Opens Browser at `url` once `session` is selected. */
    requestBrowser: (session: string, url: string) => setPendingBrowser({ session, url }),
  };
}
