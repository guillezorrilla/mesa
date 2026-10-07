import type { DecisionStatus, ScopedContext, SiteMode } from '@mesa/core';
import { measuredText, shortAgo } from '@mesa/core/browser';
import { useCallback, useEffect, useState } from 'react';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useOpenSettings } from '@/features/settings/useOpenSettings';
import { useCall } from '@/lib/useCommand';

const MODE: Record<SiteMode, string> = {
  automatic: 'Automatic',
  'on-demand': 'On demand',
  off: 'Off',
};

const seconds = (ms: number) => `${ms / 1000} s`;

/**
 * One session's decision assistance (ADR-0019): each site's mode and what it measured against
 * Mesa's gates, a switch that turns it off for this session, its deadlines and ready answers, its
 * recent use with why a call gave no answer, and a preview of its scoped context; with no model,
 * Set up opens Settings on Smarter decisions. Read when the details open; advice here never acts
 * on the session.
 */
export function DecisionAssistancePanel(props: { session: string }) {
  const call = useCall();
  const [status, setStatus] = useState<DecisionStatus>();
  const [error, setError] = useState<string>();
  const [preview, setPreview] = useState<{ context?: ScopedContext; error?: string }>();
  const [acting, setActing] = useState(false);
  const { session } = props;
  const openSettings = useOpenSettings();

  const read = useCallback(
    () =>
      call('decisions.status', { session }).then((result) => {
        if (result.ok) {
          setStatus(result.data);
          setError(undefined);
        } else setError(result.error.message);
      }),
    [call, session],
  );
  useEffect(() => {
    void read();
  }, [read]);

  if (error) return <p className="text-xs text-destructive">{error}</p>;
  if (!status) return <Muted size="xs">Reading decision assistance...</Muted>;
  const noModel = status.model === 'none';
  const now = Date.now();
  return (
    <div data-testid="session-decisions" className="grid gap-2 text-xs">
      <div className="flex items-center justify-between gap-2">
        <span className="flex items-center gap-2">
          {noModel ? 'Off: no Decision model' : `Model ${status.model}`}
          {noModel && openSettings && (
            <Button
              size="xs"
              variant="link"
              className="h-auto p-0 text-xs"
              onClick={() => openSettings('decisions')}
            >
              Set up
            </Button>
          )}
        </span>
        <Switch
          aria-label="Decision assistance for this session"
          checked={!noModel && !status.off}
          disabled={noModel || acting}
          onCheckedChange={(on) => {
            setActing(true);
            void call('decisions.setOff', { session, off: !on })
              .then((result) => (result.ok ? read() : setError(result.error.message)))
              .finally(() => setActing(false));
          }}
        />
      </div>
      <ul className="grid gap-1">
        {status.sites.map((s) => (
          <li key={s.site} className="grid gap-0.5">
            <span className="flex items-center justify-between gap-2">
              <span className="font-mono">{s.site}</span>
              <Badge
                variant="outline"
                title={s.acceptAt === undefined ? undefined : `Accepts at margin ${s.acceptAt}`}
              >
                {MODE[s.mode]}
                {s.experimental ? ' (experimental)' : ''}
              </Badge>
            </span>
            {s.measured && <Muted size="xs">{measuredText(s.measured)}</Muted>}
          </li>
        ))}
      </ul>
      <Muted size="xs">
        Deadlines {seconds(status.deadlines.automatic)} per turn,{' '}
        {seconds(status.deadlines['on-demand'])} on demand. {status.ready} ready answers, reused
        until a source changes. Advice never acts, approves or marks work complete.
      </Muted>
      {status.use.length ? (
        <ul data-testid="session-decision-use" className="grid gap-0.5">
          {status.use.slice(0, 5).map((u) => (
            <li key={`${u.at}-${u.site}-${u.status}`} title={u.reason}>
              {shortAgo(u.at, now)} {u.site} {u.status}
              {u.cached ? ', ready answer' : `, ${u.latencyMs} ms`}
              {u.status === 'unavailable' && u.reason ? `: ${u.reason}` : ''}
            </li>
          ))}
        </ul>
      ) : (
        <Muted size="xs">No decision use yet.</Muted>
      )}
      {!noModel && !status.off && (
        <div className="grid gap-1">
          <Button
            size="sm"
            variant="outline"
            disabled={acting}
            onClick={() => {
              setActing(true);
              void call('decisions.context', { session })
                .then((result) => {
                  setPreview(
                    result.ok ? { context: result.data } : { error: result.error.message },
                  );
                  return read();
                })
                .finally(() => setActing(false));
            }}
          >
            Preview context
          </Button>
          {preview?.error && <p className="text-destructive">{preview.error}</p>}
          {preview?.context && (
            <div data-testid="session-context-preview" className="grid gap-1">
              <p>{preview.context.advice}</p>
              <ol className="list-decimal pl-4">
                {preview.context.sources.map((s) => (
                  <li key={s.id} className="break-all font-mono" title={s.excerpt}>
                    {s.id}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
