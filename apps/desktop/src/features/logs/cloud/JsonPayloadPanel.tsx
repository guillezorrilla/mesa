import { JsonTreePanel } from './JsonTreePanel';

/** A JSON message as an open-able key and value tree (JsonTreePanel), never one raw string. */
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
        <JsonTreePanel json={props.json} />
      </div>
    </details>
  );
}
