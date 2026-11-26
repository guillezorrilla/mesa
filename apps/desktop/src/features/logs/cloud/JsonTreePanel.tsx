/** A JSON value's key and value list, nested objects and arrays as their own lists under their key. */
export function JsonTreePanel(props: { json: Record<string, unknown> | unknown[] }) {
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
              <JsonTreePanel json={value as Record<string, unknown>} />
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
