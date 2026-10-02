import type { ReactNode } from 'react';

/** One of a card's hover actions; its click stays off the card. */
export function CardAction(props: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={(event) => {
        // The card's own click would start or open a session too.
        event.stopPropagation();
        props.onClick();
      }}
      className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-50 [&_svg]:size-3.5"
    >
      {props.children}
    </button>
  );
}
