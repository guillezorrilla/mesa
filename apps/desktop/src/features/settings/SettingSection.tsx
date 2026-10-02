import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';
import { Muted } from '@/components/Muted';

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
        <Muted size="xs">{props.description}</Muted>
      </div>
      {props.group && (
        <Muted size="xs" className="flex items-center gap-2 font-medium uppercase tracking-wide">
          {GroupIcon && <GroupIcon aria-hidden className="size-3.5" />}
          {props.group}
        </Muted>
      )}
      <div className="space-y-2">{props.children}</div>
    </section>
  );
}
