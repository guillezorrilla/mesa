import { ImpactPanel } from './ImpactPanel';

/** The project screen's Impact tab: Impact scoped to the project, with a switch to the profile. */
export function ImpactTab(props: { project: string; onSession: (id: string) => void }) {
  return (
    <section aria-label="Impact" className="min-w-0 pt-3">
      <ImpactPanel project={props.project} onSession={props.onSession} />
    </section>
  );
}
