import { Plus, X } from 'lucide-react';
import { RetryAlert } from '@/components/RetryAlert';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import type { EnvRow } from './types';

const NAME = 'h-7 w-28 shrink-0 px-2 font-mono text-xs';

/**
 * The setup's envs (CONTEXT.md, Cloud Logs): the suggestions for the projects picked (envSuggestions)
 * as checkable rows with an editable name and the filter shown muted, then custom envs, a name and a
 * raw Logging filter each. Rows of one name join into one env when saved (joinEnvs).
 */
export function CloudEnvPicker(props: {
  rows: EnvRow[];
  busy: boolean;
  /** Why the suggestions could not be read, with Retry. */
  error?: string;
  onRetry: () => void;
  onRows: (rows: EnvRow[]) => void;
}) {
  const { rows } = props;
  const change = (i: number, next: Partial<EnvRow>) =>
    props.onRows(rows.map((row, j) => (j === i ? { ...row, ...next } : row)));
  const suggested = rows.flatMap((row, i) => (row.from ? [{ row, i }] : []));
  const custom = rows.flatMap((row, i) => (row.from ? [] : [{ row, i }]));
  return (
    <div className="grid gap-3">
      <ul aria-label="Suggested envs" className="overflow-hidden rounded-lg border bg-card">
        {suggested.map(({ row, i }) => (
          <li
            key={row.filter}
            className="flex items-center gap-3 border-b px-3 py-2 last:border-b-0"
          >
            <Checkbox
              aria-label={`Use ${row.from}`}
              checked={row.on}
              onCheckedChange={(on) => change(i, { on: on === true })}
            />
            <Input
              aria-label={`Env name for ${row.from}`}
              className={NAME}
              value={row.name}
              onChange={(event) => change(i, { name: event.currentTarget.value, on: true })}
            />
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-xs">{row.from}</span>
              <code className="truncate text-[11px] text-muted-foreground">{row.filter}</code>
            </div>
          </li>
        ))}
        {props.error && (
          <li className="p-2">
            <RetryAlert
              title="Envs could not be suggested"
              message={props.error}
              onRetry={props.onRetry}
            />
          </li>
        )}
        {!suggested.length && !props.error && (
          <li className="px-3 py-2.5 text-xs text-muted-foreground">
            {props.busy
              ? 'Looking for GKE clusters and Cloud Run services'
              : 'No GKE cluster or env-suffixed Cloud Run service found: add a custom env, or none to read everything.'}
          </li>
        )}
      </ul>
      {custom.map(({ row, i }) => (
        <div key={i} className="flex items-center gap-2">
          <Input
            aria-label="Env name"
            placeholder="prod"
            className={NAME}
            value={row.name}
            onChange={(event) => change(i, { name: event.currentTarget.value })}
          />
          <Input
            aria-label="Env filter"
            placeholder='resource.labels.namespace_name="prod"'
            className="h-7 font-mono text-xs"
            value={row.filter}
            onChange={(event) => change(i, { filter: event.currentTarget.value })}
          />
          <Button
            size="icon-sm"
            variant="ghost"
            aria-label="Remove env"
            onClick={() => props.onRows(rows.filter((_, j) => j !== i))}
          >
            <X aria-hidden />
          </Button>
        </div>
      ))}
      <Button
        size="sm"
        variant="ghost"
        className="justify-self-start text-muted-foreground"
        onClick={() => props.onRows([...rows, { name: '', filter: '', on: true }])}
      >
        <Plus aria-hidden /> Custom env
      </Button>
    </div>
  );
}
