import { SendHorizontal, Waypoints, X } from 'lucide-react';
import { CenteredState } from '@/components/CenteredState';
import { IconButton } from '@/components/IconButton';
import { Button } from '@/components/ui/button';
import { LevelBadge } from '../shared/LevelBadge';
import { LogRow } from '../shared/LogRow';
import { clockTime } from '../shared/logLines';
import { MessageBody } from '../shared/MessageBody';
import { ServiceDot } from '../shared/ServiceDot';
import type { ShownRequest } from './useWholeRequest';

/**
 * Show this request: every line of one request across the project's sources, in time order, each
 * with its source's dot and name, stacks folded; a header with the sources it crossed, Send this
 * request, and Close back to the source.
 */
export function RequestView(props: {
  request: ShownRequest;
  label: (source: string) => string;
  /** A source's own name, for the narrow column beside each line. */
  name: (source: string) => string;
  onSend: () => void;
  onClose: () => void;
}) {
  const { id, read, failure } = props.request;
  const sources = [...new Set(read?.entries.map((entry) => entry.source))];
  return (
    <section aria-label={`Request ${id}`} className="flex min-h-0 flex-1 flex-col">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b bg-state-working/[0.04] py-1.5 pr-2 pl-3 text-xs">
        <Waypoints aria-hidden className="size-3.5 text-state-working" />
        <span className="rounded bg-state-working/12 px-1.5 py-0.5 font-mono text-[11px] text-state-working">
          request {id}
        </span>
        {read && (
          <span className="text-muted-foreground tabular-nums">
            {read.entries.length} {read.entries.length === 1 ? 'line' : 'lines'} across{' '}
            {sources.length} {sources.length === 1 ? 'source' : 'sources'}
          </span>
        )}
        <div className="ml-auto flex items-center gap-1">
          <Button
            size="xs"
            variant="outline"
            disabled={!read?.entries.length}
            onClick={props.onSend}
          >
            <SendHorizontal aria-hidden /> Send this request
          </Button>
          <IconButton size="icon-xs" label="Close this request" icon={X} onClick={props.onClose} />
        </div>
        {sources.length > 0 && (
          <div className="flex w-full flex-wrap gap-x-3 gap-y-0.5 text-muted-foreground">
            {sources.map((source) => (
              <ServiceDot key={source} service={props.label(source)} colorKey={source} />
            ))}
          </div>
        )}
        {read?.failed.map((each) => (
          <p key={each.source} className="w-full truncate text-state-waiting" title={each.message}>
            Could not read {props.label(each.source)}: {each.message}
          </p>
        ))}
      </header>
      <div
        role="listbox"
        aria-label={`Lines of request ${id}`}
        className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[11.5px] leading-5"
      >
        {failure ? (
          <CenteredState alert message={failure} />
        ) : !read ? (
          <CenteredState message="Reading every source" />
        ) : !read.entries.length ? (
          <CenteredState message={`No lines name request ${id}.`} />
        ) : (
          read.entries.map((entry, at) => (
            <LogRow
              // biome-ignore lint/suspicious/noArrayIndexKey: a read request's lines are fixed.
              key={at}
              level={entry.level}
              selected={false}
              onSelect={() => {}}
              time={clockTime(entry.time)}
              badge={<LevelBadge level={entry.level} />}
              logger={<ServiceDot service={props.name(entry.source)} colorKey={entry.source} />}
              loggerAlways
            >
              <MessageBody message={entry.message} stack={entry.stack} />
            </LogRow>
          ))
        )}
      </div>
    </section>
  );
}
