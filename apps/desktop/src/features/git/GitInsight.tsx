import { RefreshCw } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';

/** Explicit read-only local Git and branch-matched PR refresh. */
export function GitInsight(props: { project: string; checkout?: string }) {
  const insight = useCommand('git.insight', props);
  const local = insight.data?.local;
  const prs = insight.data?.pullRequests;
  return (
    <section className="space-y-3 rounded-lg border bg-card/40 p-4" aria-label="Repository insight">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-medium">Repository insight</h3>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={insight.busy}
          onClick={() => void insight.refresh()}
        >
          <RefreshCw aria-hidden /> Refresh
        </Button>
      </div>
      {local && (
        <div className="space-y-1 text-sm">
          <p>
            <Badge variant="secondary">{local.branch ?? 'Detached'}</Badge>{' '}
            <span className="font-mono">{local.head.slice(0, 7)}</span>
          </p>
          <p>
            {local.changedFiles} changed files, {local.worktrees} linked checkouts
          </p>
          <Muted size="xs">Local Git, observed {local.observedAt}</Muted>
          {local.recent.map((commit) => (
            <p key={commit.oid} className="truncate text-xs" title={commit.subject}>
              <span className="font-mono text-muted-foreground">{commit.oid.slice(0, 7)}</span>{' '}
              {commit.subject}
            </p>
          ))}
        </div>
      )}
      {prs && (
        <div className="space-y-2 border-t pt-3 text-sm">
          <p>
            Pull requests <Badge variant="outline">{prs.availability}</Badge>
          </p>
          <Muted size="xs">
            GitHub CLI{prs.version ? ` ${prs.version}` : ''}, observed {prs.observedAt}. Session
            links match branch names only.
          </Muted>
          {prs.availability === 'available' && !prs.searched && (
            <p>No session worktree branches to check.</p>
          )}
          {prs.availability === 'available' && prs.searched && !prs.matches.length && (
            <p>No matching PRs in this result.</p>
          )}
          {prs.availability !== 'available' && (
            <p>
              PR outcomes are unavailable from the native GitHub CLI
              {prs.unavailableReason ? ` (${prs.unavailableReason})` : ''}.
            </p>
          )}
          {prs.matches.map((pr) => (
            <div key={pr.number} className="rounded-md border p-3">
              <p>
                <Badge variant="secondary">{pr.isDraft ? 'DRAFT' : pr.state}</Badge> #{pr.number}{' '}
                {pr.title}
              </p>
              <p className="font-mono text-xs text-muted-foreground">
                {pr.branch} - sessions {pr.sessionIds.join(', ')}
              </p>
              <Muted size="xs">Updated {pr.updatedAt}</Muted>
              <a
                className="break-all text-xs text-primary underline"
                href={pr.url}
                target="_blank"
                rel="noopener noreferrer"
              >
                {pr.url}
              </a>
            </div>
          ))}
          {prs.limited && <Muted size="xs">Only the latest 100 PRs were checked.</Muted>}
        </div>
      )}
      {!insight.data && insight.busy && <Muted>Reading repository insight...</Muted>}
    </section>
  );
}
