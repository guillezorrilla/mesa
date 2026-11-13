import type { CallResult } from '@mesa/core/phone';
import { type ReactNode, use } from 'react';
import { ErrorNote } from '@/components/ErrorNote';
import { Screen } from '@/components/Screen';
import { Section } from '@/components/Section';
import { Text } from '@/components/ui/text';
import type { MacRead } from '../mac/tryCall';
import { CostAlert } from './CostAlert';
import { CostTiles } from './CostTiles';
import { DayChart } from './DayChart';
import { SessionCosts } from './SessionCosts';

/**
 * Usage as the Mac counted it, under `header`: alerts first, then the periods, the days and the
 * sessions.
 */
export function UsageBody({
  answer,
  header,
}: {
  answer: Promise<MacRead<CallResult<'usage'>>>;
  header?: ReactNode;
}) {
  const { result, error } = use(answer);
  return (
    <Screen className="gap-6" header={header}>
      {error ? <ErrorNote text={error} /> : null}
      {result ? (
        <>
          {result.alerts.map((alert) => (
            <CostAlert key={alert} text={alert} />
          ))}
          <CostTiles
            today={{ cost: result.today, excluded: result.excluded.today }}
            week={{ cost: result.week, excluded: result.excluded.week }}
            month={{ cost: result.month, excluded: result.excluded.month }}
          />
          <Section title="Last 14 days">
            <DayChart days={result.days} />
          </Section>
          <Section title="Sessions">
            <SessionCosts sessions={result.sessions} />
          </Section>
          <Text variant="muted">
            Estimated from each agent's own token counts at list prices. Alerts never pause
            sessions.
          </Text>
        </>
      ) : null}
    </Screen>
  );
}
