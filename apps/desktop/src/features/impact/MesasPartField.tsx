import { NO_OUTCOME } from '@mesa/core/browser';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';
import { useNavigate } from '@/lib/useNavigate';

/** The newest Moments session details show. */
const NEWEST = 3;

/**
 * Session details' Mesa's part: the session's newest Moments, each as its plain question and
 * outcome, and a link to its whole thread in Impact.
 */
export function MesasPartField(props: { session: string }) {
  const navigate = useNavigate();
  const report = useCommand('impact.report', { session: props.session });
  const moments = report.data?.sessions[0]?.moments ?? [];
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
                <span className="text-muted-foreground"> · {m.outcome?.text ?? NO_OUTCOME}</span>
              </li>
            ))}
        </ul>
      ) : (
        'Nothing yet'
      )}
      {navigate && (
        <Button
          variant="link"
          size="sm"
          className="h-auto justify-start p-0"
          onClick={() => navigate({ kind: 'impact', session: props.session })}
        >
          See the whole thread
        </Button>
      )}
    </div>
  );
}
