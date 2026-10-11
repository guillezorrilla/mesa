import type { ViewQuery } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';

/** How a tracker words the count: its items, the query under Advanced, and what it leaves out. */
export type CountWords = { nouns: string; query: string; extra?: string };

const JIRA: CountWords = { nouns: 'tickets', query: 'the JQL Mesa sends' };

/** How many tickets `view` lists right now, and the query Mesa sends for it under Advanced. */
export function ViewCount(props: { view: ViewQuery; name: string; words?: CountWords }) {
  const preview = useCommand('tickets.preview', { view: props.view });
  const data = preview.data;
  const { nouns, query, extra = '' } = props.words ?? JIRA;
  return (
    <div className="grid gap-2">
      <Muted role="status">
        {data
          ? (data.note ??
            `${data.count}${data.more ? '+' : ''} ${nouns} right now${extra}, shown as "${props.name}".`)
          : `Counting ${nouns}...`}
      </Muted>
      {data?.jql && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">Advanced: {query}</summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-2.5 font-mono text-xs">
            {data.jql}
          </pre>
        </details>
      )}
    </div>
  );
}
