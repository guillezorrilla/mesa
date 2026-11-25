import type { CloudErrorGroup, IncidentLink } from '@mesa/core';
import {
  consoleUrl,
  groupQuery,
  jsonObject,
  linkReason,
  plainTitle,
  splitMessage,
} from '@mesa/core/browser';
import { ExternalLink, MessageSquareText, Wrench } from 'lucide-react';
import { CountPill } from '@/components/CountPill';
import { ExternalLink as Link } from '@/components/ExternalLink';
import { Sparkline } from '@/components/Sparkline';
import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import type { CloudFilters } from '@/lib/client/logs';
import { CopyButton } from '../../shared/CopyButton';
import { dayTime } from '../../shared/logLines';
import { ServiceDot } from '../../shared/ServiceDot';
import { fieldClause } from '../explorer/explorerQuery';
import { MessageView } from '../MessageView';
import { useCloudCopy } from '../useCloudCopy';
import { useCloudLogsConfig } from '../useCloudLogsConfig';
import { ErrorBadge } from './ErrorBadge';
import { ErrorOccurrences } from './ErrorOccurrences';

function Section(props: { title: string; children: React.ReactNode }) {
  return (
    <section aria-label={props.title} className="grid gap-1.5">
      <h3 className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

/**
 * The Errors pane for one group (CONTEXT.md, Cloud Logs): its count over the range, its stack
 * folded, its top message variants, its context fields' facets, the groups linked to it and why,
 * its occurrences, and Ask about this, Fix in session, Copy (with its summary, query and link) and
 * Open in Cloud Console.
 */
export function ErrorDetail(props: {
  group: CloudErrorGroup;
  related: { links: IncidentLink[]; other: CloudErrorGroup; key: string }[];
  filters: CloudFilters;
  onSelect: (key: string) => void;
  onAsk: (group: CloudErrorGroup) => void;
  onFix: (group: CloudErrorGroup) => void;
  onExplore: (query: CloudFilters) => void;
}) {
  const { group } = props;
  const { copy, copySummary, copyText } = useCloudCopy();
  const query = groupQuery(group, useCloudLogsConfig().gcp);
  const url = consoleUrl(group.project, query, { since: props.filters.since });
  const samples = group.samples ?? [];
  const raw = group.sample || samples[0]?.message || group.message;
  const json = jsonObject(splitMessage(raw).head);
  const explore = (extra?: string) =>
    props.onExplore({
      ...props.filters,
      projects: [group.project],
      services: undefined,
      filter: extra ? `${query} AND ${extra}` : query,
    });
  return (
    <article aria-label="Error detail" className="grid content-start gap-6 p-6">
      <header className="grid gap-2">
        <h2
          className="font-mono text-[13px] font-semibold [overflow-wrap:anywhere]"
          title={group.message}
        >
          {plainTitle(group.message)}
        </h2>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {group.badge && <ErrorBadge badge={group.badge} />}
          <CountPill
            count={group.count}
            className="rounded bg-state-failed/12 px-1.5 font-medium text-state-failed tabular-nums"
          />
          {group.services.map((service) => (
            <ServiceDot key={service} service={service} colorKey={`${group.project}/${service}`} />
          ))}
          <span>{group.project}</span>
          <span>first {dayTime(group.firstSeen)}</span>
          <span>last {dayTime(group.lastSeen)}</span>
          {group.reported && (
            <span>{group.reported.count.toLocaleString()} in all envs (Error Reporting)</span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <Button size="sm" variant="outline" className="h-7" onClick={() => props.onAsk(group)}>
            <MessageSquareText aria-hidden /> Ask about this
          </Button>
          <Button size="sm" variant="outline" className="h-7" onClick={() => props.onFix(group)}>
            <Wrench aria-hidden /> Fix in session
          </Button>
          <CopyButton
            size="sm"
            label="Copy"
            onCopy={(format) => copy(samples.length ? samples : [], format)}
            extra={
              <>
                <DropdownMenuItem onSelect={() => copySummary(group, samples)}>
                  Copy summary
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyText(query, 'the query')}>
                  Copy query
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => copyText(url, 'the link')}>
                  Link to Cloud Console
                </DropdownMenuItem>
              </>
            }
          />
          <Link
            href={url}
            className="inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium hover:bg-accent [&_svg]:size-4"
          >
            <ExternalLink aria-hidden /> Open in Cloud Console
          </Link>
        </div>
      </header>
      {group.spark && (
        <Section title="Over the range">
          <Sparkline
            counts={group.spark}
            className="h-12 gap-0.5 [&>span]:w-2"
            label={`${group.count} errors over the range`}
          />
        </Section>
      )}
      <Section title={json ? 'Payload' : 'Stack'}>
        <div className="rounded-md border bg-muted/20 px-3 py-2 font-mono text-[11.5px] leading-5">
          <MessageView message={raw} open />
        </div>
      </Section>
      {(group.variants?.length ?? 0) > 1 && (
        <Section title="Message variants">
          <ol className="grid gap-1 font-mono text-[11.5px]">
            {group.variants?.map((variant) => (
              <li key={variant.message} className="flex gap-2">
                <span className="w-10 shrink-0 text-right text-muted-foreground tabular-nums">
                  {variant.count}
                </span>
                <span className="truncate" title={variant.message}>
                  {variant.message}
                </span>
              </li>
            ))}
          </ol>
        </Section>
      )}
      {(group.facets?.length ?? 0) > 0 && (
        <Section title="Context">
          <dl className="grid gap-1.5 text-xs">
            {group.facets?.map((facet) => (
              <div key={facet.key} className="flex flex-wrap items-baseline gap-1.5">
                <dt className="w-24 shrink-0 truncate text-muted-foreground">{facet.key}</dt>
                {facet.values.map(({ value, count }) => (
                  <dd key={value}>
                    <button
                      type="button"
                      title={`Open these with ${facet.key} = ${value} in Explorer`}
                      className="rounded bg-muted px-1.5 font-mono text-[11px] hover:bg-accent"
                      onClick={() => explore(fieldClause(facet.key, value))}
                    >
                      {value} <span className="text-muted-foreground">{count}</span>
                    </button>
                  </dd>
                ))}
              </div>
            ))}
          </dl>
        </Section>
      )}
      {props.related.length > 0 && (
        <Section title="Related">
          <ul className="grid gap-1">
            {props.related.map(({ links, other, key }) => (
              <li key={key}>
                <button
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
                  onClick={() => props.onSelect(key)}
                >
                  <span className="truncate font-mono">{plainTitle(other.message)}</span>
                  <span className="text-right text-muted-foreground tabular-nums">
                    {Math.round(Math.max(...links.map((l) => l.strength)) * 100)}%
                  </span>
                  <span className="col-span-2 text-muted-foreground">
                    {[...links]
                      .sort((a, b) => b.strength - a.strength)
                      .map(linkReason)
                      .join('; ')}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </Section>
      )}
      <Section title="Occurrences">
        <ErrorOccurrences group={group} filters={props.filters} onExplore={() => explore()} />
      </Section>
    </article>
  );
}
