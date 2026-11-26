import type { ErrorGroup } from '@mesa/core';
import { ArrowDown, Plus } from 'lucide-react';
import { CenteredState } from '@/components/CenteredState';
import { Button } from '@/components/ui/button';
import type { KeyedEntry } from '../shared/logLines';
import { ErrorGroupRow } from './ErrorGroupRow';
import { LogEntryRow } from './LogEntryRow';
import { useFollowEnd } from './useFollowEnd';
import type { LogWatch } from './useLogWatch';
import type { RowActions } from './useRowActions';

/**
 * The Logs panel's list: its state when there is nothing to show (a failure, no source, reading,
 * nothing matching), else the shown entries or, in the Errors view, their groups; kept at its end
 * while Live, with a "12 new" pill when scrolled up.
 */
export function LogList(props: {
  watch: LogWatch;
  shown: readonly KeyedEntry[];
  groups?: readonly ErrorGroup<KeyedEntry>[];
  picked: ReadonlySet<string>;
  openGroups: ReadonlySet<string>;
  onOpenGroup: (key: string) => void;
  actions: RowActions;
  onAddSource: () => void;
}) {
  const { watch, shown, groups } = props;
  const follow = useFollowEnd(shown);
  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div
        ref={follow.ref}
        role="listbox"
        aria-label="Log lines"
        aria-multiselectable
        className="min-h-0 flex-1 overflow-auto py-1 font-mono text-[11.5px] leading-5"
        onScroll={follow.onScroll}
      >
        {watch.failure ? (
          <CenteredState alert message={watch.failure} />
        ) : watch.sources?.length === 0 ? (
          <CenteredState
            message="No running containers or server sessions for this project. Start the server with Docker or in a Mesa terminal session, or add a log source."
            action={
              <Button size="sm" variant="outline" onClick={props.onAddSource}>
                <Plus aria-hidden /> Add a log source
              </Button>
            }
          />
        ) : !watch.entries ? (
          <CenteredState message={watch.source ? 'Reading' : 'Looking for sources'} />
        ) : !shown.length ? (
          <CenteredState
            message={watch.entries.length ? 'No lines match this filter.' : 'Nothing logged yet.'}
          />
        ) : groups ? (
          groups.map((group) => (
            <ErrorGroupRow
              key={group.key}
              group={group}
              open={props.openGroups.has(group.key)}
              onOpen={props.onOpenGroup}
              picked={props.picked}
              actions={props.actions}
            />
          ))
        ) : (
          shown.map((entry) => (
            <LogEntryRow
              key={entry.key}
              entry={entry}
              selected={props.picked.has(entry.key)}
              actions={props.actions}
            />
          ))
        )}
      </div>
      {watch.live && follow.newCount > 0 && (
        <Button
          size="sm"
          className="absolute bottom-3 left-1/2 h-7 -translate-x-1/2 rounded-full px-3 text-xs shadow-md"
          onClick={follow.jump}
        >
          <ArrowDown aria-hidden /> {follow.newCount} new
        </Button>
      )}
    </div>
  );
}
