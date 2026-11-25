/** A JSON message as an open-able key and value list, never one raw string. */
export function JsonPayloadPanel(props: {
  json: Record<string, unknown>;
  title: string;
  open?: boolean;
}) {
  return (
    <details open={props.open} className="group/json min-w-0">
      <summary className="cursor-pointer truncate font-mono text-[12px] marker:text-muted-foreground">
        {props.title}
      </summary>
      <dl className="mt-1.5 grid grid-cols-[minmax(6rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-0.5 rounded-md border bg-muted/30 px-3 py-2 font-mono text-[11.5px]">
        {Object.entries(props.json).map(([key, value]) => (
          <div key={key} className="contents">
            <dt className="text-muted-foreground">{key}</dt>
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}
