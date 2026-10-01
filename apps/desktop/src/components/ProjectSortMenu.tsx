import type { ProjectSort } from '@mesa/core';
import { Check, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

const OPTIONS: readonly [ProjectSort, string][] = [
  ['recent', 'Recent'],
  ['last-session', 'Last session'],
  ['active-sessions', 'Active sessions'],
  ['most-visited', 'Most visited'],
];

export function ProjectSortMenu(props: { sort: ProjectSort; onSort: (sort: ProjectSort) => void }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          data-testid="project-sort"
          aria-label="Sort projects"
          title="Sort projects"
        >
          <Settings2 aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {OPTIONS.map(([value, label]) => (
          <DropdownMenuItem
            key={value}
            role="menuitemradio"
            aria-checked={props.sort === value}
            onSelect={() => props.onSort(value)}
          >
            <Check aria-hidden className={props.sort === value ? 'size-4' : 'size-4 invisible'} />{' '}
            {label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
