import { contextPercent } from '@mesa/core/browser';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/** From here a session's context is getting full: amber, then red (CONTEXT.md, Context use). */
const AMBER = 55;
const RED = 60;

/** A context reading's tone, by the percent it shows, so one reading 55% is never uncoloured. */
export const contextTone = (used: number) => {
  const shown = contextPercent(used);
  return shown >= RED ? 'red' : shown >= AMBER ? 'amber' : 'normal';
};

/** The progress indicator's colour for a context tone, so every context bar reads alike. */
export const toneIndicator = (tone: ReturnType<typeof contextTone>) =>
  cn(
    tone === 'amber' && '[&>[data-slot=progress-indicator]]:bg-state-waiting',
    tone === 'red' && '[&>[data-slot=progress-indicator]]:bg-state-failed',
  );

/** How full a session's context is: a bar with its percent, amber from 55% and red from 60%. */
export function ContextBar(props: { used: number; window: number }) {
  const shown = contextPercent(props.used);
  const tone = contextTone(props.used);
  return (
    <div
      data-testid="context-bar"
      data-tone={tone}
      title={`${props.used.toFixed(1)}% of a ${props.window.toLocaleString()}-token window`}
      className="flex items-center gap-2"
    >
      <Progress
        value={shown}
        aria-label="Context used"
        className={cn('h-1.5 w-16', toneIndicator(tone))}
      />
      <span className="font-mono text-xs tabular-nums">{shown}%</span>
    </div>
  );
}
