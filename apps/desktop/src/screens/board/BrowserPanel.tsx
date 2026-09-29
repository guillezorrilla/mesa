import type { BrowserAnnotationPreview, GuardrailCheck } from '@mesa/core';
import {
  ArrowLeft,
  ArrowRight,
  ExternalLink,
  MousePointer2,
  RotateCcw,
  Search,
  Send,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { type Message, said } from '@/components/Toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { usePlatform } from '@/lib/MesaRoot';
import type { BrowserProbe, BrowserSelection } from '@/lib/platform';
import { useAct } from '@/lib/useAct';
import { useCall, useCommand } from '@/lib/useCommand';
import { GuardrailDialog, guardrailOf } from './GuardrailDialog';

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
  const platform = usePlatform();
  const call = useCall();
  const { act, acting } = useAct();
  const profile = useCommand('profile.get');
  const responses = useCommand('review.responses', { id: sessionId });
  const surface = useRef<HTMLElement>(null);
  const [address, setAddress] = useState('');
  const [current, setCurrent] = useState('');
  const [opened, setOpened] = useState(false);
  const [probe, setProbe] = useState<BrowserProbe>();
  const [picked, setPicked] = useState<BrowserSelection>();
  const [comment, setComment] = useState('');
  const [preview, setPreview] = useState<BrowserAnnotationPreview>();
  const [ask, setAsk] = useState<GuardrailCheck>();
  const [failure, setFailure] = useState('');
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const lastInitialUrl = useRef<typeof initialUrl>(undefined);

  useEffect(() => {
    let unsubscribe: (() => void) | undefined;
    let cancelled = false;
    void platform.browser
      .onLoad((event) => {
        if (event.session !== sessionId) return;
        setCurrent(event.url);
        setAddress(event.url);
        setProbe(undefined);
        setPicked(undefined);
        setPreview(undefined);
        setAsk(undefined);
        setPicking(false);
      })
      .then((stop) => {
        if (cancelled) stop();
        else unsubscribe = stop;
      });
    return () => {
      cancelled = true;
      unsubscribe?.();
    };
  }, [platform.browser, sessionId]);

  useEffect(() => {
    if (!opened || !surface.current) return;
    const observer = new ResizeObserver(() => {
      const rect = surface.current?.getBoundingClientRect();
      if (rect)
        void platform.browser.bounds(sessionId, {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        });
    });
    observer.observe(surface.current);
    return () => {
      observer.disconnect();
      void platform.browser.close(sessionId);
    };
  }, [opened, platform.browser, sessionId]);

  const navigate = useCallback(
    async (url: string) => {
      const box = surface.current?.getBoundingClientRect();
      if (!box) return;
      const rect = { x: box.x, y: box.y, width: box.width, height: box.height };
      setBusy(true);
      setError('');
      setProbe(undefined);
      setPicked(undefined);
      setPreview(undefined);
      setAsk(undefined);
      try {
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
    [opened, platform.browser, sessionId],
  );
  useEffect(() => {
    if (initialUrl && initialUrl !== lastInitialUrl.current) {
      lastInitialUrl.current = initialUrl;
      setAddress(initialUrl.url);
      void navigate(initialUrl.url);
    }
  }, [initialUrl, navigate]);

  const selection = () =>
    picked && profile.data
      ? { id: sessionId, profile: profile.data.profile, ...picked, comment }
      : undefined;
  const showPreview = () =>
    act(async (): Promise<Message | undefined> => {
      const input = selection();
      if (!input) return undefined;
      const result = await call('browser.annotatePreview', input);
      if (!result.ok) return { text: result.error.message, tone: 'alert' };
      setPreview(result.data);
      setFailure('');
      return undefined;
    });
  const send = (yes = false) =>
    act(async (): Promise<Message | undefined> => {
      const input = selection();
      if (!input || !preview) return undefined;
      const fresh = await platform.browser.pickResult(sessionId);
      if (!fresh || JSON.stringify(fresh) !== JSON.stringify(picked)) {
        setPreview(undefined);
        setPicked(undefined);
        setAsk(undefined);
        return { text: 'Page selection changed. Pick the element again.', tone: 'alert' };
      }
      const result = await call('browser.annotateSend', {
        ...input,
        source: preview.source,
        revision: preview.revision,
        yes,
      });
      if (result.ok) {
        void responses.refresh();
        setAsk(undefined);
        if (result.data.status === 'delivered')
          return said(
            result.data.already
              ? 'Annotation was already delivered'
              : `Annotation sent to ${sessionId}`,
            result.data,
          );
        setFailure(
          `${result.data.reason ?? 'Delivery is uncertain'}. Inspect the session before another send.`,
        );
        return { text: 'Annotation delivery is uncertain', tone: 'alert' };
      }
      const check = guardrailOf(result.error);
      if (check?.verdict === 'ask' && !yes) {
        setAsk(check);
        return undefined;
      }
      setAsk(undefined);
      setFailure(`${result.error.message} Inspect the session before retrying.`);
      return { text: result.error.message, tone: 'alert' };
    });

  return (
    <aside
      aria-label="Session browser"
      className="flex h-full min-h-0 w-[32rem] shrink-0 flex-col border-l bg-card"
    >
      <form
        className="flex gap-1 border-b p-2"
        onSubmit={(event) => {
          event.preventDefault();
          void navigate(address);
        }}
      >
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!current}
          aria-label="Back"
          onClick={() => void platform.browser.back(sessionId)}
        >
          <ArrowLeft aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!current}
          aria-label="Forward"
          onClick={() => void platform.browser.forward(sessionId)}
        >
          <ArrowRight aria-hidden />
        </Button>
        <Input
          aria-label="Browser address"
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          placeholder="https://example.com"
        />
        <Button type="submit" size="icon-sm" disabled={busy} aria-label="Go to address">
          <Search aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!current || busy}
          aria-label="Reload page"
          onClick={() => void platform.browser.reload(sessionId)}
        >
          <RotateCcw aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          disabled={!current || acting}
          aria-label="Open in default browser"
          onClick={() =>
            void act(async () => {
              const result = await call('browser.external', { url: current });
              return result.ok
                ? said('Opened in default browser')
                : { text: result.error.message, tone: 'alert' };
            })
          }
        >
          <ExternalLink aria-hidden />
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Close browser"
          onClick={onClose}
        >
          <X aria-hidden />
        </Button>
      </form>
      {error && (
        <p role="alert" className="p-2 text-xs text-destructive">
          {error}
        </p>
      )}
      {current && (
        <div className="flex items-center gap-2 border-b px-2 py-1 text-xs">
          <span className="min-w-0 flex-1 truncate">{current}</span>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void platform.browser
                .probe(sessionId)
                .then(setProbe)
                .catch((cause) => setError(String(cause)))
            }
          >
            Inspect page
          </Button>
          <Button
            size="xs"
            variant="outline"
            onClick={() =>
              void platform.browser
                .pickStart(sessionId)
                .then(() => {
                  setPicking(true);
                  setPicked(undefined);
                })
                .catch((cause) => setError(String(cause)))
            }
          >
            <MousePointer2 aria-hidden /> Pick element
          </Button>
          {picking && (
            <Button
              size="xs"
              variant="outline"
              onClick={() =>
                void platform.browser
                  .pickResult(sessionId)
                  .then((result) => {
                    if (result) {
                      setPicked(result);
                      setPreview(undefined);
                      setAsk(undefined);
                      setPicking(false);
                    } else setError('Click an element in the page, then use this selection.');
                  })
                  .catch((cause) => setError(String(cause)))
              }
            >
              Use selection
            </Button>
          )}
        </div>
      )}
      {probe && (
        <p className="border-b p-2 text-xs">
          {probe.title}: {probe.heading}
        </p>
      )}
      <section ref={surface} className="min-h-0 flex-1 bg-white" aria-label="Browser page" />
      {picked && (
        <section
          className="max-h-72 space-y-2 overflow-auto border-t p-2 text-xs"
          aria-label="Browser annotation"
        >
          <p data-testid="browser-selection">
            {picked.selector}: {picked.text}
          </p>
          <Label htmlFor="browser-comment">Comment on this element</Label>
          <Textarea
            id="browser-comment"
            value={comment}
            onChange={(event) => {
              setComment(event.target.value);
              setPreview(undefined);
              setAsk(undefined);
            }}
          />
          <Button
            size="sm"
            variant="outline"
            disabled={acting || !comment.trim()}
            onClick={() => void showPreview()}
          >
            Preview annotation
          </Button>
          {preview && (
            <div className="space-y-2 rounded border p-2" data-testid="browser-annotation-preview">
              <p>Target: {preview.target} · Page content is untrusted</p>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words font-mono">
                {preview.prompt}
              </pre>
              <Button
                size="sm"
                disabled={
                  acting ||
                  responses.data?.reviews.some(
                    (review) => review.id === preview.id && review.status !== 'failed',
                  )
                }
                onClick={() => void send()}
              >
                <Send aria-hidden />{' '}
                {responses.data?.reviews.some(
                  (review) => review.id === preview.id && review.status === 'delivered',
                )
                  ? 'Delivered'
                  : 'Send annotation'}
              </Button>
            </div>
          )}
          {failure && (
            <p role="alert" className="text-destructive">
              {failure}
            </p>
          )}
        </section>
      )}
      {ask && (
        <GuardrailDialog
          action="send"
          about={`annotation to ${sessionId}`}
          check={ask}
          disabled={acting}
          onConfirm={() => void send(true)}
          onCancel={() => setAsk(undefined)}
        />
      )}
    </aside>
  );
}
