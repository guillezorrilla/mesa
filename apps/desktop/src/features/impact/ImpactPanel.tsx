import { useState } from 'react';
import { SegmentedControl } from '@/components/SegmentedControl';
import { useCommand } from '@/lib/useCommand';
import { ImpactSessionCard } from './ImpactSessionCard';

const PERIODS = [
  [7, 'Last 7 days'],
  [30, 'Last 30 days'],
] as const;

/**
 * Impact's body (CONTEXT.md): its period and scope, the one-sentence summary, and one card per
 * session. Given a project, it opens scoped to it with a switch to the whole profile; given a
 * session, that session's card comes first and open.
 */
export function ImpactPanel(props: {
  project?: string;
  session?: string;
  onSession?: (id: string) => void;
}) {
  const [days, setDays] = useState<7 | 30>(7);
  const [scope, setScope] = useState<'profile' | 'project'>(props.project ? 'project' : 'profile');
  const project = scope === 'project' ? props.project : undefined;
  const report = useCommand('impact.report', { days, ...(project ? { project } : {}) });
  const sessions = [...(report.data?.sessions ?? [])].sort(
    (a, b) => Number(b.id === props.session) - Number(a.id === props.session),
  );
  return (
    <div className="min-w-0 space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-2">
        {props.project && (
          <SegmentedControl
            label="Scope"
            options={[
              ['profile', 'Profile'],
              ['project', `Project: ${props.project}`],
            ]}
            value={scope}
            onChange={setScope}
          />
        )}
        <SegmentedControl label="Period" options={PERIODS} value={days} onChange={setDays} />
      </div>
      <p data-testid="impact-summary" className="max-w-3xl text-lg leading-relaxed">
        {report.data?.sentence ?? (report.error ? report.error.message : 'Reading...')}
      </p>
      <div className="grid gap-3">
        {sessions.map((s) => (
          <ImpactSessionCard
            key={`${s.id}-${days}-${project}`}
            session={s}
            expanded={s.id === props.session}
            onSession={props.onSession}
          />
        ))}
      </div>
    </div>
  );
}
