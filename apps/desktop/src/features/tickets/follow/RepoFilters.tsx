import { ChevronDown, Milestone, Plus, X } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { useCommand } from '@/lib/useCommand';
import { GithubLabel, labelHex } from '../github/GithubLabel';
import { PickMenu } from './PickMenu';
import { StepLabel } from './StepLabel';

/** A filter's name, then its field. */
function FilterRow(props: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2.5 text-[13px]">
      <span className="pt-1.5 text-muted-foreground">{props.name}</span>
      <div className="grid gap-1.5">{props.children}</div>
    </div>
  );
}

/**
 * A GitHub Follow dialog's second step, optional: the repo's labels (every one picked must be on
 * an issue) and one milestone, or none, each picked from a searchable list and starting empty.
 * Picked labels show as GitHub draws them, each one removed by a click.
 */
export function RepoFilters(props: {
  repo: string;
  labels: string[];
  milestone: string | undefined;
  onLabels: (labels: string[]) => void;
  onMilestone: (milestone: string | undefined) => void;
}) {
  const repo = useCommand('tickets.repo', { repo: props.repo });
  const labels = repo.data?.labels ?? [];
  const toggle = (name: string) =>
    props.onLabels(
      props.labels.includes(name)
        ? props.labels.filter((l) => l !== name)
        : [...props.labels, name],
    );
  const milestones = [
    { value: '*', name: 'Any milestone' },
    ...(repo.data?.milestones ?? []).map((m) => ({ value: String(m.number), name: m.title })),
    { value: 'none', name: 'No milestone' },
  ];
  const milestone = props.milestone ?? '*';
  return (
    <div className="grid gap-2">
      <StepLabel step={2}>Narrow it down</StepLabel>
      <div className="grid gap-3 rounded-lg border p-3" data-testid="repo-filters">
        <FilterRow name="Labels">
          {!repo.data ? (
            <span className="pt-1.5 text-muted-foreground">Reading labels...</span>
          ) : !labels.length ? (
            <span className="pt-1.5 text-muted-foreground">None in this repo</span>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1.5">
                {props.labels.map((name) => (
                  <button
                    key={name}
                    type="button"
                    aria-label={`Remove label ${name}`}
                    onClick={() => toggle(name)}
                    className="group rounded-full"
                  >
                    <GithubLabel
                      name={name}
                      color={labels.find((l) => l.name === name)?.color}
                      className="py-0.5 pr-1.5"
                    >
                      <X aria-hidden className="size-3 opacity-60 group-hover:opacity-100" />
                    </GithubLabel>
                  </button>
                ))}
                <PickMenu
                  label="Labels"
                  search={`Search ${labels.length} labels`}
                  empty="No label matches."
                  items={labels.map((l) => ({
                    value: l.name,
                    name: l.name,
                    color: labelHex(l.color) ?? '',
                  }))}
                  picked={props.labels}
                  multiple
                  onPick={toggle}
                  trigger={
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      data-testid="labels-button"
                      className="h-7 rounded-full border-dashed px-2.5 text-[12.5px] font-normal text-muted-foreground"
                    >
                      <Plus aria-hidden className="size-3.5" />
                      {props.labels.length ? 'Add label' : 'Any label'}
                    </Button>
                  }
                />
              </div>
              {props.labels.length > 1 && (
                <span className="text-xs text-muted-foreground">
                  Issues must have every label picked.
                </span>
              )}
            </>
          )}
        </FilterRow>
        <FilterRow name="Milestone">
          <PickMenu
            label="Milestone"
            search="Search milestones"
            empty="No milestone matches."
            items={milestones}
            picked={[milestone]}
            onPick={(value) => props.onMilestone(value === '*' ? undefined : value)}
            trigger={
              <button
                type="button"
                data-testid="milestone-button"
                className="flex h-8 w-full items-center gap-2 rounded-md border border-input bg-card px-2.5 text-left text-sm"
              >
                <Milestone aria-hidden className="size-3.5 text-muted-foreground" />
                <span className="truncate">
                  {milestones.find((m) => m.value === milestone)?.name}
                </span>
                <ChevronDown aria-hidden className="ml-auto size-3.5 text-muted-foreground" />
              </button>
            }
          />
        </FilterRow>
      </div>
    </div>
  );
}
