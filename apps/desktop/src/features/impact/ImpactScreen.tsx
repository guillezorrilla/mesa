import { PageHeader } from '@/components/PageHeader';
import { ImpactPanel } from './ImpactPanel';

/** The Impact screen (CONTEXT.md, Impact): what Mesa decided and kept, and what happened next. */
export function ImpactScreen(props: {
  project?: string;
  session?: string;
  onSession?: (id: string) => void;
}) {
  return (
    <section aria-label="Impact" className="min-w-0">
      <PageHeader
        title="Impact"
        description="What Mesa decided and kept for you, and what happened next."
      />
      <ImpactPanel {...props} />
    </section>
  );
}
