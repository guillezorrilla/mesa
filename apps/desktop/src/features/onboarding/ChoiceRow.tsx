import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

/** One option of an onboarding step: a native radio or checkbox, its title, and a muted line. */
export function ChoiceRow(props: {
  type: 'radio' | 'checkbox';
  name: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  title: ReactNode;
  detail?: ReactNode;
  testId?: string;
}) {
  return (
    <label
      data-testid={props.testId}
      className={cn(
        'flex cursor-pointer items-start gap-3 rounded-md border px-3 py-2 text-sm',
        props.checked && 'border-primary bg-accent/40',
      )}
    >
      <input
        type={props.type}
        name={props.name}
        className="mt-1 accent-primary"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
      />
      <span className="min-w-0">
        <span className="block font-medium">{props.title}</span>
        {props.detail && (
          <span className="block truncate font-mono text-muted-foreground text-xs">
            {props.detail}
          </span>
        )}
      </span>
    </label>
  );
}
