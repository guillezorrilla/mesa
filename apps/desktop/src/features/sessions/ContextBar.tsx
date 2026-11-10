import { contextPercent, contextTone } from '@mesa/core/browser';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';

/** The progress indicator's colour for a context tone, so every context bar reads alike. */
export const toneIndicator = (tone: ReturnType<typeof contextTone>) =>
  cn(
    tone === 'amber' && '[&>[data-slot=progress-indicator]]:bg-state-waiting',
    tone === 'red' && '[&>[data-slot=progress-indicator]]:bg-state-failed',
  );

/** How full a session's context is: a bar with its percent, toned as contextTone says. */
export function ContextBar(props: { used: number; window: number }) {
  const shown = contextPercent(props.used);
  const tone = contextTone(props);
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
