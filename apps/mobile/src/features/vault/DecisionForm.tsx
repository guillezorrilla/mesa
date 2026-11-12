import { startTransition, useState } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Section } from '@/components/Section';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { DraftField } from './DraftField';
import { ProjectPicker } from './ProjectPicker';
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
      <Section title="Project">
        <ProjectPicker projects={projects} picked={draft.project} onPick={set('project')} />
      </Section>
      <DraftField
        label="Title"
        value={draft.title}
        onChange={set('title')}
        placeholder="Metres for tide heights"
        disabled={busy}
      />
      <DraftField
        label="Decision"
        value={draft.decision}
        onChange={set('decision')}
        placeholder="What was decided"
        long
        disabled={busy}
      />
      <DraftField
        label="Rationale"
        value={draft.rationale}
        onChange={set('rationale')}
        placeholder="Why it was decided"
        long
        disabled={busy}
      />
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
