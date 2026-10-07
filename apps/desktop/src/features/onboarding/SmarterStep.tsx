import { Sparkles } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';

/**
 * Make Mesa smarter, optional: what a decision model adds, Settings > Smarter decisions to
 * connect one, and Skip for now, which leaves Mesa on its rules alone.
 */
export function SmarterStep(props: { modelSet: boolean; onOpen: () => void; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <Muted>
        When its own rules are unsure, Mesa can ask a hosted decision model, so each session gets
        the right project notes at the right time. CLEF, on Cloudflare, has a free daily allowance.
        Optional: with none, nothing leaves this Mac.
      </Muted>
      <div className="flex items-center justify-end gap-2">
        <Button
          variant="secondary"
          data-testid="onboarding-smarter-settings"
          onClick={props.onOpen}
        >
          <Sparkles aria-hidden /> Open Smarter decisions
        </Button>
        <Button
          variant={props.modelSet ? 'default' : 'ghost'}
          data-testid="onboarding-continue"
          onClick={props.onNext}
        >
          {props.modelSet ? 'Continue' : 'Skip for now'}
        </Button>
      </div>
    </div>
  );
}
