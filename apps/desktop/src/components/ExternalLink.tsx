import type { ReactNode } from 'react';

/** A link that opens in the browser; `className` replaces its default underlined look. */
export function ExternalLink(props: { href: string; children: ReactNode; className?: string }) {
  return (
    <a
      className={props.className ?? 'text-primary underline'}
      href={props.href}
      target="_blank"
      rel="noopener noreferrer"
    >
      {props.children}
    </a>
  );
}
