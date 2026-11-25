import { serviceColor } from './logLines';

/** A service's dot in its stable colour (serviceColor), and its name unless `bare`. */
export function ServiceDot(props: { service: string; colorKey?: string; bare?: boolean }) {
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5" title={props.service}>
      <span
        aria-hidden
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: serviceColor(props.colorKey ?? props.service) }}
      />
      {!props.bare && <span className="truncate">{props.service}</span>}
    </span>
  );
}
