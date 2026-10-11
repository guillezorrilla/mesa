import type { ReactNode } from 'react';
import { useCommand } from '@/lib/useCommand';
import { cn } from '@/lib/utils';
import { labelHex } from '../github/GithubLabel';
import { StepLabel } from './StepLabel';

/** A filter chip, pressed when picked. */
function Chip(props: { pressed: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={props.pressed}
      onClick={props.onClick}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-[12.5px]',
        props.pressed && 'border-primary bg-accent',
      )}
    >
      {props.children}
    </button>
  );
}

/** A filter's name, then its chips. */
function FilterRow(props: { name: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-2.5 text-[13px]">
      <span className="pt-0.5 text-muted-foreground">{props.name}</span>
      <div className="flex flex-wrap gap-1.5">{props.children}</div>
    </div>
  );
}

/**
 * A GitHub Follow dialog's second step, optional: the repo's labels (every one picked must be on
 * an issue) and one milestone, or none, as chips that start empty.
 */
export function RepoFilters(props: {
  repo: string;
  labels: string[];
  milestone: string | undefined;
  onLabels: (labels: string[]) => void;
  onMilestone: (milestone: string | undefined) => void;
}) {
  const repo = useCommand('tickets.repo', { repo: props.repo });
  const toggle = (name: string) =>
    props.onLabels(
      props.labels.includes(name)
        ? props.labels.filter((l) => l !== name)
        : [...props.labels, name],
    );
  const milestones: [string | undefined, string][] = [
    [undefined, 'Any'],
    ...(repo.data?.milestones ?? []).map((m): [string, string] => [String(m.number), m.title]),
    ['none', 'No milestone'],
  ];
  return (
    <div className="grid gap-2">
      <StepLabel step={2}>Narrow it down</StepLabel>
      <div className="grid gap-2.5 rounded-lg border p-3" data-testid="repo-filters">
        <FilterRow name="Labels">
          {repo.data ? (
            repo.data.labels.length ? (
              repo.data.labels.map((label) => (
                <Chip
                  key={label.name}
                  pressed={props.labels.includes(label.name)}
                  onClick={() => toggle(label.name)}
                >
                  <span
                    aria-hidden
                    className="size-2 rounded-full bg-muted-foreground"
                    style={{ backgroundColor: labelHex(label.color) }}
                  />
                  {label.name}
                </Chip>
              ))
            ) : (
              <span className="pt-0.5 text-muted-foreground">None in this repo</span>
            )
          ) : (
            <span className="pt-0.5 text-muted-foreground">Reading labels...</span>
          )}
        </FilterRow>
        <FilterRow name="Milestone">
          {milestones.map(([value, title]) => (
            <Chip
              key={value ?? '*'}
              pressed={props.milestone === value}
              onClick={() => props.onMilestone(value)}
            >
              {title}
            </Chip>
          ))}
        </FilterRow>
      </div>
    </div>
  );
}
