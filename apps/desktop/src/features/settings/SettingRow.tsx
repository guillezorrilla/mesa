import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Muted } from '@/components/Muted';
import { cn } from '@/lib/utils';
import { useMatches } from './useMatches';

/** One setting row: icon, title, what it does, and its control on the right. */
export function SettingRow(props: {
  title: string;
  description?: ReactNode;
  icon?: LucideIcon;
  /** The id of the control, so the title labels it. */
  htmlFor?: string;
  /** Extra words the search should find this row by. */
  keywords?: string;
  control?: ReactNode;
  /** Content under the row, such as a list or an editor. */
  children?: ReactNode;
  tone?: 'danger';
}) {
  const matches = useMatches(
    `${props.title} ${typeof props.description === 'string' ? props.description : ''} ${props.keywords ?? ''}`,
  );
  const Icon = props.icon;
  return (
    <div data-setting-row hidden={!matches} className="rounded-lg border bg-card/60 px-4 py-3">
      <div className="flex items-center gap-3">
        {Icon && <Icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <label
            htmlFor={props.htmlFor}
            className={cn('block text-sm', props.tone === 'danger' && 'text-destructive')}
          >
            {props.title}
          </label>
          {props.description && <Muted size="xs">{props.description}</Muted>}
        </div>
        {props.control && <div className="shrink-0">{props.control}</div>}
      </div>
      {props.children && <div className="mt-3">{props.children}</div>}
    </div>
  );
}
