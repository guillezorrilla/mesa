import { ExternalLink, Maximize2, Minimize2, X } from 'lucide-react';
import { Terminal } from '@/components/Terminal';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

/** One session's embedded terminal under the board: open it in the terminal app, or close it. */
export function TerminalPanel(props: {
  sessionId: string;
  busy: boolean;
  onOpenExternal: () => void;
  onClose: () => void;
  onFileLink?: (session: string, target: string) => void;
  grid?: boolean;
  selected?: boolean;
  zoomed?: boolean;
  onZoom?: () => void;
}) {
  return (
    <Card
      data-testid="terminal-panel"
      className={
        props.grid || props.selected
          ? 'flex h-full flex-col gap-0 overflow-hidden rounded-none border-0 py-0'
          : 'gap-0 overflow-hidden py-0'
      }
    >
      {!props.selected && (
        <CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-2">
          <CardTitle className="min-w-0 truncate font-mono text-sm">{props.sessionId}</CardTitle>
          <div className="flex shrink-0 gap-1">
            {props.grid && (
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={props.zoomed ? `Unzoom ${props.sessionId}` : `Zoom ${props.sessionId}`}
                onClick={props.onZoom}
              >
                {props.zoomed ? <Minimize2 aria-hidden /> : <Maximize2 aria-hidden />}
              </Button>
            )}
            <Button
              variant="ghost"
              size={props.grid ? 'icon-sm' : 'sm'}
              aria-label={props.grid ? `Open ${props.sessionId} in terminal app` : undefined}
              data-testid="open-external-terminal"
              onClick={props.onOpenExternal}
              disabled={props.busy}
            >
              <ExternalLink aria-hidden />
              {!props.grid && 'Open in terminal app'}
            </Button>
            <Button
              variant="ghost"
              size={props.grid ? 'icon-sm' : 'sm'}
              aria-label={props.grid ? `Close ${props.sessionId} tile` : undefined}
              data-testid="close-terminal"
              onClick={props.onClose}
            >
              <X aria-hidden />
              {!props.grid && 'Close'}
            </Button>
          </div>
        </CardHeader>
      )}
      <Terminal
        sessionId={props.sessionId}
        fill={props.grid || props.selected}
        onFileLink={props.onFileLink}
      />
    </Card>
  );
}
