import { ExternalLink, X } from 'lucide-react';
import { Terminal } from '@/components/Terminal';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';

/** One session's embedded terminal under the board: open it in the terminal app, or close it. */
export function TerminalPanel(props: {
  sessionId: string;
  busy: boolean;
  onOpenExternal: () => void;
  onClose: () => void;
}) {
  return (
    <Card data-testid="terminal-panel" className="gap-0 overflow-hidden py-0">
      <CardHeader className="flex flex-row items-center justify-between gap-2 border-b px-4 py-2">
        <CardTitle className="font-mono text-sm">{props.sessionId}</CardTitle>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="sm"
            data-testid="open-external-terminal"
            onClick={props.onOpenExternal}
            disabled={props.busy}
          >
            <ExternalLink aria-hidden />
            Open in terminal app
          </Button>
          <Button variant="ghost" size="sm" data-testid="close-terminal" onClick={props.onClose}>
            <X aria-hidden />
            Close
          </Button>
        </div>
      </CardHeader>
      <Terminal sessionId={props.sessionId} />
    </Card>
  );
}
