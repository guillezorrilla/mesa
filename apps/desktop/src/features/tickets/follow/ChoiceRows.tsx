import type { ReactNode } from 'react';

/** One choice: its name, a line under it where it has one, and a hint at the row's end. */
export type Choice = { id: string; name: string; sub?: string; hint?: ReactNode };

/**
 * A Follow dialog's choices as radio rows in a bordered list, the picked one checked: a Jira
 * board or saved filter, a Linear cycle, project or saved view. Says None found. once read empty.
 */
export function ChoiceRows(props: {
  label: string;
  /** The radio group's name, and its rows' id prefix. */
  name: string;
  choices: Choice[] | undefined;
  picked: string | undefined;
  onPick: (choice: Choice) => void;
}) {
  const { choices, name } = props;
  return (
    <div
      role="radiogroup"
      aria-label={props.label}
      className="max-h-44 divide-y overflow-auto rounded-lg border"
    >
      {choices?.map((c) => (
        <label
          key={c.id}
          htmlFor={`${name}-${c.id}`}
          className="flex cursor-pointer items-center gap-2.5 px-3 py-2 text-sm hover:bg-accent/60"
        >
          <input
            id={`${name}-${c.id}`}
            type="radio"
            name={name}
            checked={props.picked === c.id}
            onChange={() => props.onPick(c)}
            className="accent-primary"
          />
          {c.sub ? (
            <span className="grid">
              {c.name}
              <span className="text-xs text-muted-foreground">{c.sub}</span>
            </span>
          ) : (
            c.name
          )}
          <span className="ml-auto text-xs text-muted-foreground">{c.hint}</span>
        </label>
      ))}
      {choices && !choices.length && (
        <p className="px-3 py-2 text-sm text-muted-foreground">None found.</p>
      )}
    </div>
  );
}
