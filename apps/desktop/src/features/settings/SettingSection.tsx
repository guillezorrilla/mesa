import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

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
