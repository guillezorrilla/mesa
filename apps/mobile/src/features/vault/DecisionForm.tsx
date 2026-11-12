import { startTransition, useState } from 'react';
import { ChoiceChips } from '@/components/ChoiceChips';
import { ErrorNote } from '@/components/ErrorNote';
import { FormField } from '@/components/FormField';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Text } from '@/components/ui/text';
import { ReceiptStub } from './ReceiptStub';
import { useSaveDecision } from './useSaveDecision';
import { type DecisionDraft, draftReady } from './vaultText';

/** A decision, its rationale and its project, saved once; then its receipt stub in its place. */
export function DecisionForm({
  projects,
  project,
}: {
  projects: { name: string; label: string }[];
  project: string;
}) {
  const [draft, setDraft] = useState<DecisionDraft>({
    project,
    title: '',
    decision: '',
    rationale: '',
  });
  const [saving, save, busy] = useSaveDecision();
  const set = (key: keyof DecisionDraft) => (value: string) =>
    setDraft((d) => ({ ...d, [key]: value }));
  if (saving.saved) return <ReceiptStub saved={saving.saved} />;
  return (
    <>
      <FormField label="Project">
        <ChoiceChips
          label="Project"
          choices={projects.map((p) => [p.name, p.label] as const)}
          value={draft.project}
          onChange={set('project')}
        />
      </FormField>
      <FormField label="Title">
        <Input
          value={draft.title}
          onChangeText={set('title')}
          placeholder="Metres for tide heights"
          accessibilityLabel="Title"
          editable={!busy}
        />
      </FormField>
      <FormField label="Decision">
        <Input
          value={draft.decision}
          onChangeText={set('decision')}
          placeholder="What was decided"
          accessibilityLabel="Decision"
          editable={!busy}
          multiline
          textAlignVertical="top"
          className="min-h-24"
        />
      </FormField>
      <FormField label="Rationale">
        <Input
          value={draft.rationale}
          onChangeText={set('rationale')}
          placeholder="Why it was decided"
          accessibilityLabel="Rationale"
          editable={!busy}
          multiline
          textAlignVertical="top"
          className="min-h-24"
        />
      </FormField>
      {saving.error ? <ErrorNote text={saving.error} /> : null}
      <Button
        disabled={busy || !draftReady(draft)}
        onPress={() => startTransition(() => save(draft))}
      >
        <Text>{busy ? 'Saving...' : 'Save decision'}</Text>
      </Button>
    </>
  );
}
