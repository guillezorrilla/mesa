import { type CallResult, localDay } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { ListSection } from './ListSection';
import { NoteView } from './NoteView';

const dayOf = (iso: string) => localDay(new Date(iso));

/** A project's memory: the start of its hub, its decisions and notes, and its earlier goals. */
export function ProjectBody({ read }: { read: Promise<MacRead<CallResult<'project'>>> }) {
  const { result: memory, error } = use(read);
  if (!memory) return <Screen>{error ? <ErrorNote text={error} /> : null}</Screen>;
  const { hub, decisions, notes, goals } = memory;
  return (
    <Screen className="gap-6">
      {hub ? <NoteView note={hub} /> : null}
      {!hub && !decisions.length && !notes.length && !goals.length ? (
        <Text variant="muted">Nothing in the vault for this project yet.</Text>
      ) : null}
      <ListSection
        title="Decisions"
        items={decisions.map((d) => ({ key: d.path, title: d.title, stamp: d.when, path: d.path }))}
      />
      <ListSection
        title="Notes"
        items={notes.map((n) => ({
          key: n.path,
          title: n.title,
          stamp: dayOf(n.modified),
          path: n.path,
        }))}
      />
      <ListSection
        title="Earlier goals"
        items={goals.map((g) => ({
          key: g.id,
          title: g.goal ?? 'Started without a goal',
          stamp: dayOf(g.started),
          path: g.summary,
        }))}
      />
    </Screen>
  );
}
