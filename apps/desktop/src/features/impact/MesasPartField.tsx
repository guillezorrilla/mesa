import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';

/** The newest Moments session details show. */
const NEWEST = 3;

/**
 * Session details' Mesa's part: the session's newest Moments, each as its plain question and
 * outcome, and a link to its whole thread in Impact.
 */
export function MesasPartField(props: { session: string; onImpact?: (session: string) => void }) {
  const report = useCommand('impact.report', { session: props.session });
  const moments = report.data?.sessions.find((s) => s.id === props.session)?.moments ?? [];
  if (!report.data) return report.error ? report.error.message : 'Reading...';
  return (
    <div className="grid gap-1.5" data-testid="session-mesas-part">
      {moments.length ? (
        <ul className="grid gap-1">
          {moments
            .slice(-NEWEST)
            .reverse()
            .map((m) => (
              <li key={m.id}>
                <span className="font-medium">{m.title}</span>
                <span className="text-muted-foreground">
                  {' '}
                  · {m.outcome?.text ?? 'No outcome yet'}
                </span>
              </li>
            ))}
        </ul>
      ) : (
        'Nothing yet'
      )}
      {props.onImpact && (
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-start p-0"
          onClick={() => props.onImpact?.(props.session)}
        >
          See the whole thread
        </Button>
      )}
    </div>
  );
}
