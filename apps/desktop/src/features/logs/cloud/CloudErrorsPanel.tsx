import type { CloudErrorGroup } from '@mesa/core';
import { ChevronRight, Wrench } from 'lucide-react';
import { useState } from 'react';
import { Muted } from '@/components/Muted';
import { ReadingBar } from '@/components/ReadingBar';
import { Button } from '@/components/ui/button';
import type { CloudFilters } from '@/lib/client/logs';
import { useCommand, useOptional, useRun } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { dayTime } from '../shared/logLines';
import { CloudProjectDialog } from './CloudProjectDialog';
import { CloudReadAlert } from './CloudReadAlert';
import { serviceColor } from './cloudLines';
import { ErrorOccurrences } from './ErrorOccurrences';
import { useCloudSession } from './useCloudSession';

const BADGE = { new: 'New', back: 'Back again' } as const;

/**
 * Errors mode (CONTEXT.md, Cloud Logs): the error groups across the GCP projects, most first, each
 * with its count, first and last seen, services and a New / Back again badge; a group opens its
 * samples with folded stacks, and Fix in session starts a session in the project mapped to its
 * service, asking once which one.
 */
export function CloudErrorsPanel(props: {
  filters: CloudFilters;
  onSession: (id: string) => void;
  /** Opens Explore on a group's occurrences. */
  onExplore: (query: CloudFilters) => void;
}) {
  const errors = useOptional('logs.errors', props.filters);
  const config = useCommand('config.get');
  const run = useRun();
  const start = useCloudSession();
  const [open, setOpen] = useState<string>();
  const [fixing, setFixing] = useState<CloudErrorGroup>();
  const fixProjects = config.data?.logs.fixProjects ?? {};
  const refOf = (group: CloudErrorGroup) => `${group.project}/${group.services[0] ?? '-'}`;
  const goal = (group: CloudErrorGroup) =>
    [
      `Fix this error from Cloud Logs: ${group.message}`,
      '',
      `It happened ${group.count} times in ${group.project} (${group.services.join(', ') || 'no service'}), first ${group.firstSeen}, last ${group.lastSeen}.`,
      '',
      'One occurrence, with its stack:',
      group.sample,
      '',
      `The query: mesa logs ${group.source === 'error-reporting' ? `errors samples ${group.project} ${group.id}` : `gcp --project ${group.project} --severity error --text ${JSON.stringify(group.message.slice(0, 80))}`}`,
    ].join('\n');
  const fix = async (group: CloudErrorGroup, project: string) => {
    const id = await start(project, goal(group));
    if (id) props.onSession(id);
  };
  const head = (
    <>
      {errors.busy && <ReadingBar />}
      <CloudReadAlert error={errors.error} warnings={errors.data?.warnings} />
    </>
  );
  if (!errors.data)
    return (
      <>
        {head}
        <Muted className="px-1 py-4">
          {errors.busy ? 'Reading error groups' : 'No error groups'}
        </Muted>
      </>
    );
  if (!errors.data.groups.length)
    return (
      <>
        {head}
        <Muted className="px-1 py-4">
          No errors in this range. Widen the time range or switch env.
        </Muted>
      </>
    );
  return (
    <>
      {head}
      <ol
        aria-label="Error groups"
        className="@container overflow-hidden rounded-lg border bg-card font-mono text-[11.5px] leading-5"
      >
        {errors.data.groups.map((group) => {
          const key = `${group.project} ${group.id}`;
          return (
            <li
              key={key}
              className="border-b border-l-2 border-b-border/60 border-l-state-failed/70 last:border-b-0"
            >
              <div className="flex items-center gap-2 pr-2">
                <button
                  type="button"
                  aria-expanded={open === key}
                  className="flex min-w-0 flex-1 items-center gap-2 px-3 py-1.5 text-left hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
                  onClick={() => setOpen(open === key ? undefined : key)}
                >
                  <ChevronRight
                    aria-hidden
                    className={cn(
                      'size-3.5 shrink-0 text-muted-foreground transition-transform',
                      open === key && 'rotate-90',
                    )}
                  />
                  <span
                    className="min-w-0 flex-1 truncate font-medium text-foreground"
                    title={group.message}
                  >
                    {group.message || '(no message)'}
                  </span>
                  {group.badge && (
                    <span
                      className={cn(
                        'shrink-0 rounded px-1.5 font-sans text-[10.5px] font-medium',
                        group.badge === 'new'
                          ? 'bg-state-working/15 text-foreground'
                          : 'bg-state-waiting/15 text-state-waiting',
                      )}
                    >
                      {BADGE[group.badge]}
                    </span>
                  )}
                  {group.services.map((service) => (
                    <span
                      key={service}
                      className="hidden shrink-0 items-center gap-1 font-sans text-[11px] text-muted-foreground @min-[48rem]:inline-flex"
                    >
                      <span
                        aria-hidden
                        className="size-2 rounded-full"
                        style={{ backgroundColor: serviceColor(`${group.project}/${service}`) }}
                      />
                      {service}
                    </span>
                  ))}
                  <span className="shrink-0 rounded bg-state-failed/12 px-1.5 font-sans text-[11px] font-medium tabular-nums text-state-failed">
                    x{group.count}
                  </span>
                  <span className="shrink-0 font-sans text-[11px] text-muted-foreground tabular-nums">
                    last {dayTime(group.lastSeen)}
                  </span>
                </button>
                <Button
                  size="sm"
                  variant="ghost"
                  className="h-7 shrink-0 font-sans"
                  onClick={() => {
                    const mapped = fixProjects[refOf(group)];
                    if (mapped) void fix(group, mapped);
                    else setFixing(group);
                  }}
                >
                  <Wrench aria-hidden /> Fix in session
                </Button>
              </div>
              {open === key && (
                <div className="grid gap-1.5 px-3 pt-1 pb-2.5 pl-8">
                  <p className="font-sans text-[11.5px] text-muted-foreground">
                    {group.project}, first {dayTime(group.firstSeen)}
                    {group.source === 'error-reporting'
                      ? ', from Error Reporting'
                      : group.reported
                        ? `, grouped from the logs; ${group.reported.count} in all envs in Error Reporting`
                        : ', grouped from the logs'}
                  </p>
                  <ErrorOccurrences
                    group={group}
                    filters={props.filters}
                    onExplore={props.onExplore}
                  />
                </div>
              )}
            </li>
          );
        })}
      </ol>
      {fixing && (
        <CloudProjectDialog
          title="Fix in which project?"
          description={`A session starts there with the error, its samples and its query as its goal.`}
          remember={refOf(fixing)}
          onCancel={() => setFixing(undefined)}
          onPick={(project, remember) => {
            const group = fixing;
            setFixing(undefined);
            void (async () => {
              if (remember)
                await run('config.set', {
                  path: 'logs.fixProjects',
                  value: { ...fixProjects, [refOf(group)]: project },
                });
              await fix(group, project);
            })();
          }}
        />
      )}
    </>
  );
}
