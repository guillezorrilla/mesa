/** A JSON value's key and value list, nested objects and arrays as their own lists under their key. */
export function JsonTree(props: { json: Record<string, unknown> | unknown[] }) {
  return (
    <dl className="grid grid-cols-[max-content_minmax(0,1fr)] gap-x-3 gap-y-0.5 font-mono text-[11.5px]">
      {Object.entries(props.json).map(([key, value]) => (
        <div key={key} className="contents">
          <dt className="max-w-40 truncate text-muted-foreground" title={key}>
            {key}
          </dt>
          {value && typeof value === 'object' ? (
            // A nested object takes the whole width under its key, so a narrow row stays readable.
            <dd className="col-span-2 ml-1 border-l pl-3">
              <JsonTree json={value as Record<string, unknown>} />
            </dd>
          ) : (
            <dd className="min-w-0 [overflow-wrap:anywhere]">
              {typeof value === 'string' ? value : JSON.stringify(value)}
            </dd>
          )}
        </div>
      ))}
    </dl>
  );
}

/** A JSON message as an open-able key and value tree (JsonTree), never one raw string. */
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
      <div className="mt-1.5 rounded-md border bg-muted/30 px-3 py-2">
        <JsonTree json={props.json} />
      </div>
    </details>
  );
}
