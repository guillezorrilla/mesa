import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/** From here a session's context is getting full: amber, then red (CONTEXT.md, Context use). */
const AMBER = 55;
const RED = 60;

/** How full a session's context is: a bar with its percent, amber from 55% and red from 60%. */
export function ContextBar(props: { used: number; window: number }) {
  const used = Math.min(100, Math.max(0, props.used));
  // By the percent it shows, so a bar reading 55% is never left uncoloured.
  const shown = Math.round(used);
  const tone = shown >= RED ? 'red' : shown >= AMBER ? 'amber' : 'normal';
  return (
    <div
      data-testid="context-bar"
      data-tone={tone}
      title={`${props.used.toFixed(1)}% of a ${props.window.toLocaleString()}-token window`}
      className="flex items-center gap-2"
    >
      <Progress
        value={used}
        aria-label="Context used"
        className={cn(
          'h-1.5 w-16',
          tone === 'amber' && '[&>[data-slot=progress-indicator]]:bg-state-waiting',
          tone === 'red' && '[&>[data-slot=progress-indicator]]:bg-state-failed',
        )}
      />
      <span className="font-mono text-xs tabular-nums">{shown}%</span>
    </div>
  );
}
