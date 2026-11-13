import type { CallResult } from '@mesa/core/phone';
import { use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { ImpactStats } from './ImpactStats';
import { NoteView } from './NoteView';
import { RewindSection } from './RewindSection';

/** The day read: its date, Impact today, the Daily note or how to build it, and the Rewind. */
export function TodayBody({ read }: { read: Promise<MacRead<CallResult<'today'>>> }) {
  const { result: today, error } = use(read);
  return (
    <Screen className="gap-6">
      {error ? <ErrorNote text={error} /> : null}
      {today ? (
        <>
          <Text className="font-mono text-sm text-muted-foreground">{today.date}</Text>
          <Section title="Impact today">
            <ImpactStats impact={today.impact} />
          </Section>
          <Section title="Daily">
            {today.daily ? (
              <NoteView note={today.daily} />
            ) : (
              <Text variant="muted">No Daily note yet today. mesa daily builds it on the Mac.</Text>
            )}
          </Section>
          <RewindSection rewind={today.rewind} />
        </>
      ) : null}
    </Screen>
  );
}
