import { Check, SquareKanban } from 'lucide-react';
import { Muted } from '@/components/Muted';
import { Button } from '@/components/ui/button';
import { useAct } from '@/lib/useAct';
import { useCommand } from '@/lib/useCommand';
import { useConnect } from '@/lib/useConnect';
import { cn } from '@/lib/utils';

/**
 * The Tickets tab before any view is followed: tickets come from Jira, so it says so, and walks
 * through the two steps, signing in with Atlassian and following a view, with the next one's
 * button.
 */
export function JiraSetupPanel(props: { onFollow: () => void }) {
  const sources = useCommand('sources.list');
  const { acting, act } = useAct();
  const { signingIn, connect } = useConnect();
  const atlassian = sources.data?.sources.find((s) => s.id === 'atlassian');
  const connected = atlassian?.status === 'connected';
  const signIn = () =>
    void act(async () => {
      await connect('atlassian');
      await sources.refresh();
      return undefined;
    });
  const steps = [
    {
      title: atlassian?.connected && !connected ? 'Reconnect Jira' : 'Connect Jira',
      hint: connected ? 'Signed in with Atlassian' : 'Sign in with your Atlassian account',
      done: connected,
    },
    {
      title: 'Follow a view',
      hint: "A board's sprint, a saved filter, or a JQL query",
      done: false,
    },
  ];
  return (
    <div className="grid justify-items-center gap-6 px-6 py-14 text-center">
      <div className="grid justify-items-center gap-3">
        <span className="grid size-12 place-items-center rounded-xl bg-state-working/12 text-state-working ring-1 ring-state-working/25">
          <SquareKanban aria-hidden className="size-6" />
        </span>
        <span className="text-[11px] font-medium uppercase tracking-[0.14em] text-state-working">
          Jira
        </span>
        <h2 className="text-lg font-semibold tracking-tight">
          {connected ? 'Pick the Jira tickets to show here' : 'Bring your Jira sprint into Mesa'}
        </h2>
        <Muted className="max-w-[46ch]">
          Follow a board's sprint, a saved filter, or a query. Its tickets stay current as sprints
          change, and any ticket starts a session.
        </Muted>
      </div>
      <ol className="grid w-full max-w-xl gap-2 text-left sm:grid-cols-2">
        {steps.map((step, i) => {
          const next = !step.done && steps.slice(0, i).every((s) => s.done);
          return (
            <li
              key={step.title}
              aria-current={next ? 'step' : undefined}
              className={cn(
                'flex items-start gap-3 rounded-lg border px-3 py-2.5',
                next ? 'border-state-working/40 bg-state-working/5' : 'opacity-70',
              )}
            >
              <span
                className={cn(
                  'mt-0.5 grid size-5 shrink-0 place-items-center rounded-full text-[11px] font-semibold',
                  step.done
                    ? 'bg-state-idle/20 text-state-idle'
                    : next
                      ? 'bg-state-working text-background'
                      : 'bg-muted text-muted-foreground',
                )}
              >
                {step.done ? <Check aria-label="Done" className="size-3" /> : i + 1}
              </span>
              <span className="grid gap-0.5">
                <span className="text-sm font-medium">{step.title}</span>
                <Muted size="xs">{step.hint}</Muted>
              </span>
            </li>
          );
        })}
      </ol>
      {connected ? (
        <Button onClick={props.onFollow}>Follow a Jira view</Button>
      ) : (
        <Button disabled={acting} onClick={signIn}>
          {signingIn ? 'Waiting for sign-in...' : steps[0]?.title}
        </Button>
      )}
    </div>
  );
}
