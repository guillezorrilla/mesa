import type { LucideIcon } from 'lucide-react';
import { createContext, type ReactNode, useContext } from 'react';
import { cn } from '@/lib/utils';

/** The settings search text: a row whose words do not hold it is hidden. */
export const SettingsQuery = createContext('');

/** Whether `text` holds the settings search; with no search, everything matches. */
export function useMatches(text: string) {
  const query = useContext(SettingsQuery).trim().toLowerCase();
  return !query || text.toLowerCase().includes(query);
}

/** One setting as Xirp shows it: icon, title, what it does, and its control on the right. */
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
          {props.description && (
            <p className="text-xs text-muted-foreground">{props.description}</p>
          )}
        </div>
        {props.control && <div className="shrink-0">{props.control}</div>}
      </div>
      {props.children && <div className="mt-3">{props.children}</div>}
    </div>
  );
}

/** A titled group of rows; it hides itself while a search matches none of them. */
export function SettingSection(props: {
  id: string;
  title: string;
  description: string;
  /** The small uppercase label over the rows, with its icon. */
  group?: string;
  groupIcon?: LucideIcon;
  children: ReactNode;
}) {
  const GroupIcon = props.groupIcon;
  return (
    <section
      id={`settings-${props.id}`}
      aria-label={props.title}
      className="scroll-mt-4 space-y-3 [&:not(:has([data-setting-row]:not([hidden])))]:hidden"
    >
      <div className="border-b pb-3">
        <h3 className="text-base font-medium">{props.title}</h3>
        <p className="text-xs text-muted-foreground">{props.description}</p>
      </div>
      {props.group && (
        <p className="flex items-center gap-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
          {GroupIcon && <GroupIcon aria-hidden className="size-3.5" />}
          {props.group}
        </p>
      )}
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}
