import { ChoiceChips } from '@/components/ChoiceChips';
import { FormField } from '@/components/FormField';
import { Input } from '@/components/ui/input';
import { PLACE_CHOICES, type StartForm } from './startForm';
import { WorktreePicker } from './WorktreePicker';

/** Where it runs: the checkout, a new worktree on a branch, or a worktree that exists. */
export function PlaceField({
  form,
  onChange,
}: {
  form: StartForm;
  onChange: (patch: Partial<StartForm>) => void;
}) {
  return (
    <FormField label="Where">
      <ChoiceChips
        label="Where"
        choices={PLACE_CHOICES}
        value={form.place}
        onChange={(place) => onChange({ place })}
      />
      {form.place === 'worktree' ? (
        <Input
          value={form.branch}
          onChangeText={(branch) => onChange({ branch })}
          placeholder="Branch, new or existing (blank: Mesa names one)"
          accessibilityLabel="Branch"
          autoCapitalize="none"
          autoCorrect={false}
          className="rounded-xl bg-card font-mono shadow-none"
        />
      ) : null}
      {form.place === 'existing' && form.project ? (
        <WorktreePicker
          key={form.project}
          project={form.project}
          value={form.checkout}
          onChange={(checkout) => onChange({ checkout })}
        />
      ) : null}
    </FormField>
  );
}
