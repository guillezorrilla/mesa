import { Sparkles } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';

/**
 * Make Mesa smarter, optional: what a decision model adds, Settings > Smarter decisions to add a
 * key, and Skip for now, which leaves Mesa on its rules alone.
 */
export function SmarterStep(props: { modelSet: boolean; onOpen: () => void; onNext: () => void }) {
  return (
    <div className="space-y-4">
      <Muted>
        Mesa can ask a hosted decision model, Jev or CLEF, when its own rules are unsure. Add a key
        for one in Settings. It is optional: with no key, Mesa makes no model decisions and the
        agents work as they normally do.
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
