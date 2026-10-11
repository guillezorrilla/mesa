import type { ViewInput } from '@mesa/core';
import { Muted } from '@/components/Muted';
import { useCommand } from '@/lib/useCommand';

/** How many tickets `view` lists right now, and the JQL Mesa sends for it under Advanced. */
export function ViewCount(props: { view: Omit<ViewInput, 'name'>; name: string }) {
  const preview = useCommand('tickets.preview', { view: props.view });
  const data = preview.data;
  return (
    <div className="grid gap-2">
      <Muted role="status">
        {data
          ? (data.note ??
            `${data.count}${data.more ? '+' : ''} tickets right now, shown as "${props.name}".`)
          : 'Counting tickets...'}
      </Muted>
      {data?.jql && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            Advanced: the JQL Mesa sends
          </summary>
          <pre className="mt-2 whitespace-pre-wrap break-words rounded-md bg-muted p-2.5 font-mono text-xs">
            {data.jql}
          </pre>
        </details>
      )}
    </div>
  );
}
