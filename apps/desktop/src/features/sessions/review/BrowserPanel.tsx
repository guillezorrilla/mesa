import { useState } from 'react';
import { said } from '@/components/Toast';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { BrowserAnnotation } from './BrowserAnnotation';
import { BrowserPageBar } from './BrowserPageBar';
import { BrowserToolbar } from './BrowserToolbar';
import { useBrowserPage } from './useBrowserPage';
import { useBrowserSelection } from './useBrowserSelection';

/** A native child WKWebView alongside one selected session's terminal. */
export function BrowserPanel({
  sessionId,
  initialUrl,
  onClose,
}: {
  sessionId: string;
  initialUrl?: { url: string };
  onClose: () => void;
}) {
  const call = useCall();
  const { act, acting } = useAct();
  const profile = useCommand('profile.get');
  const responses = useCommand('review.responses', { id: sessionId });
  const [error, setError] = useState('');
  const selection = useBrowserSelection(sessionId, setError);
  const page = useBrowserPage({
    sessionId,
    initialUrl,
    clearSelection: selection.clearSelection,
    setError,
  });

  return (
    <aside
      aria-label="Session browser"
      className="flex h-full min-h-0 w-[32rem] shrink-0 flex-col border-l bg-card"
    >
      <BrowserToolbar
        address={page.address}
        current={page.current}
        busy={page.busy}
        acting={acting}
        onAddress={page.setAddress}
        onNavigate={() => void page.navigate(page.address)}
        onBack={page.back}
        onForward={page.forward}
        onReload={page.reload}
        onOpenExternal={() =>
          void act(async () => {
            const result = await call('browser.external', { url: page.current });
            return result.ok
              ? said('Opened in default browser')
              : { text: result.error.message, tone: 'alert' };
          })
        }
        onClose={onClose}
      />
      {error && (
        <p role="alert" className="p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {page.current && (
        <BrowserPageBar
          current={page.current}
          picking={selection.picking}
          onInspect={selection.inspect}
          onPick={selection.startPicking}
          onUseSelection={() => selection.takePicked(profile.data?.profile)}
        />
      )}
      {selection.probe && (
        <p className="border-b p-2 text-xs">
          {selection.probe.title}: {selection.probe.heading}
        </p>
      )}
      <section
        ref={page.surface}
        className="min-h-0 flex-1 bg-background"
        aria-label="Browser page"
      />
      <BrowserAnnotation
        sessionId={sessionId}
        profile={profile.data?.profile}
        selection={selection}
        reviews={responses.data?.reviews}
        act={act}
        acting={acting}
        onSent={() => void responses.refresh()}
      />
    </aside>
  );
}
