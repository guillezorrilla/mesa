import { Suspense } from 'react';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
import { appended } from '../compose/draftMap';
import { PromptChips } from '../compose/PromptChips';
import { usePrompts } from '../compose/usePrompts';

/** The agent's first prompt, kept as a draft, with the saved prompts to add to it. */
export function GoalField({
  goal,
  onChange,
  optional,
}: {
  goal: string;
  onChange: (goal: string) => void;
  /** Starting from a ticket, the goal only adds to the ticket's. */
  optional: boolean;
}) {
  const prompts = usePrompts();
  return (
    <FormField
      label={optional ? 'Goal (optional)' : 'Goal'}
      hint={optional ? "Added after the ticket's own goal." : undefined}
    >
      <Input
        multiline
        value={goal}
        onChangeText={onChange}
        placeholder="What should the agent do?"
        accessibilityLabel="Goal"
        textAlignVertical="top"
        className="min-h-28 rounded-xl bg-card px-4 py-3 shadow-none"
      />
      <Suspense fallback={null}>
        <PromptChips prompts={prompts} onPick={(text) => onChange(appended(goal, text))} />
      </Suspense>
    </FormField>
  );
}
