import type { AdvertisedUrl } from '@mesa/core';
import { ExternalLink, Globe, SquareArrowRight } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
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
 * The title bar's Advertised URLs: a Globe with how many still listen (or may: lsof could not
 * tell), hidden at none. Its menu lists each under its session's name, opens one in the default
 * browser, and goes to the session. Polls `mesa ports` every 10 s while the window has focus, one
 * at a time; a failed poll is quiet.
 */
export function PortsMenu(props: { onSession: (id: string) => void }) {
  const call = useCall();
  const run = useRun();
  const focused = useWindowFocused();
  const [all, setAll] = useState<AdvertisedUrl[]>([]);
  const polling = useRef(false);
  useEffect(() => {
    if (!focused) return;
    const poll = () => {
      if (polling.current) return;
      polling.current = true;
      void call('sessions.ports')
        .then((result) => result.ok && setAll(result.data.ports))
        .finally(() => {
          polling.current = false;
        });
    };
    poll();
    const timer = window.setInterval(poll, PORTS_POLL_MS);
    return () => window.clearInterval(timer);
  }, [call, focused]);
  const urls = all.filter((url) => url.listening !== false);
  const listening = urls.length;
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
                  onSelect={() => void run('browser.external', { url: url.url })}
                >
                  <ExternalLink aria-hidden className="size-4" />
                  <span className="truncate font-mono text-xs">{url.url}</span>
                  {url.listening === null && (
                    <span className="ml-auto text-xs text-muted-foreground">unknown</span>
                  )}
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
