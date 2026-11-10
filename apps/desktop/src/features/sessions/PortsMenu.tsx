import type { AdvertisedUrl } from '@mesa/core';
import { ExternalLink, Globe, SquareArrowRight } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CountPill } from '@/components/CountPill';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useCall, useRun } from '@/lib/useCommand';
import { useWindowFocused } from '@/lib/useWindowFocused';

/** How often the title bar asks which advertised URLs listen, while the window has focus. */
export const PORTS_POLL_MS = 10_000;

/**
 * The title bar's Advertised URLs: a Globe with how many still listen, hidden at none. Its menu
 * lists each URL under its session's name, opens one in the default browser, and goes to the
 * session. Polls `mesa ports` every 10 s while the window has focus; a failed poll is quiet.
 */
export function PortsMenu(props: { onSession: (id: string) => void }) {
  const call = useCall();
  const run = useRun();
  const focused = useWindowFocused();
  const [urls, setUrls] = useState<AdvertisedUrl[]>([]);
  useEffect(() => {
    if (!focused) return;
    const poll = () =>
      void call('sessions.ports').then((result) => result.ok && setUrls(result.data.ports));
    poll();
    const timer = window.setInterval(poll, PORTS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [call, focused]);
  const listening = urls.filter((url) => url.listening).length;
  if (!listening) return null;
  const sessions = [...new Set(urls.map((url) => url.session))];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          data-testid="nav-ports"
          aria-label={`Local URLs: ${listening} listening`}
          title="Local URLs sessions printed"
          className="gap-1 px-2 text-muted-foreground hover:text-foreground"
        >
          <Globe aria-hidden className="size-4" />
          <CountPill count={listening} />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        {sessions.map((session, at) => {
          const own = urls.filter((url) => url.session === session);
          return (
            <div key={session}>
              {at > 0 && <DropdownMenuSeparator />}
              <DropdownMenuLabel className="truncate">{own[0]?.sessionName}</DropdownMenuLabel>
              {own.map((url) => (
                <DropdownMenuItem
                  key={url.url}
                  className={url.listening ? undefined : 'text-muted-foreground'}
                  onSelect={() => void run('browser.external', { url: url.url })}
                >
                  <ExternalLink aria-hidden className="size-4" />
                  <span className="truncate font-mono text-xs">{url.url}</span>
                  {!url.listening && <span className="ml-auto text-xs">closed</span>}
                </DropdownMenuItem>
              ))}
              <DropdownMenuItem onSelect={() => props.onSession(session)}>
                <SquareArrowRight aria-hidden className="size-4" /> Go to session
              </DropdownMenuItem>
            </div>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
